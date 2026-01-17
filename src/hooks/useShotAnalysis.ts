import { useState, useCallback } from 'react';
import { Point, calculateAngle } from '@/lib/poseUtils';

type ShotState = 'IDLE' | 'SET' | 'RELEASE';
type TrackingStatus = 'SEARCHING' | 'TRACKING' | 'LOCKED';

export function useShotAnalysis() {
    const [state, setState] = useState<ShotState>('IDLE');
    const [feedback, setFeedback] = useState<string>("Get Ready");
    const [angle, setAngle] = useState<number>(0);
    const [isPerfect, setIsPerfect] = useState<boolean>(false);
    const [status, setStatus] = useState<TrackingStatus>('SEARCHING');
    const [guidance, setGuidance] = useState<string>("");

    const analyzeFrame = useCallback((landmarks: Point[]) => {
        if (!landmarks || landmarks.length < 33) return;

        // Visibility check helper - very low threshold
        const vis = (p: Point) => p?.visibility ?? 0;
        const isVis = (p: Point) => vis(p) > 0.2;

        // Right arm landmarks
        const rShoulder = landmarks[12];
        const rElbow = landmarks[14];
        const rWrist = landmarks[16];

        // Left arm landmarks
        const lShoulder = landmarks[11];
        const lElbow = landmarks[13];
        const lWrist = landmarks[15];

        // Hip for raised arm detection
        const rHip = landmarks[24];
        const lHip = landmarks[23];

        // Determine which arm to use based on visibility
        const rightVis = (vis(rShoulder) + vis(rElbow) + vis(rWrist)) / 3;
        const leftVis = (vis(lShoulder) + vis(lElbow) + vis(lWrist)) / 3;

        const useRight = rightVis >= leftVis;
        const shoulder = useRight ? rShoulder : lShoulder;
        const elbow = useRight ? rElbow : lElbow;
        const wrist = useRight ? rWrist : lWrist;
        const hip = useRight ? rHip : lHip;

        // Debug log
        console.log(`[Tracking] Using ${useRight ? 'RIGHT' : 'LEFT'} arm. Vis: ${(useRight ? rightVis : leftVis).toFixed(2)}`);

        // Visibility check
        if (!isVis(elbow) || !isVis(shoulder)) {
            setStatus('SEARCHING');
            setFeedback("Position Yourself");
            setAngle(0);

            // Provide directional guidance
            if (rightVis < 0.1 && leftVis < 0.1) {
                setGuidance("Step back to show upper body");
            } else if (rightVis < leftVis) {
                setGuidance("Move right or turn slightly");
            } else {
                setGuidance("Move left or turn slightly");
            }
            return;
        }

        setGuidance("");
        setStatus('TRACKING');

        // Calculate Elbow Angle
        const elbowAngle = calculateAngle(shoulder, elbow, wrist);
        setAngle(Math.round(elbowAngle));

        // Check if arm is raised
        const isArmRaised = elbow.y < hip.y;

        if (!isArmRaised) {
            setState('IDLE');
            setFeedback("Raise Ball");
            setIsPerfect(false);
            return;
        }

        setStatus('LOCKED');

        // Form Analysis State Machine
        if (elbowAngle < 120) {
            setState('SET');

            if (elbowAngle > 110) {
                setFeedback("TUCK ELBOW");
                setIsPerfect(false);
            } else if (elbowAngle < 70) {
                setFeedback("TOO TIGHT");
                setIsPerfect(false);
            } else {
                setFeedback("PERFECT FORM");
                setIsPerfect(true);
            }
        } else if (elbowAngle > 140) {
            if (state === 'SET') {
                setState('RELEASE');
                setFeedback("NICE RELEASE!");
                setIsPerfect(true);
            }
        }
    }, [state]);

    return { analyzeFrame, angle, state, feedback, isPerfect, status, guidance };
}
