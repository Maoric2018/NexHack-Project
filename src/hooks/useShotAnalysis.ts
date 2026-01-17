import { useState, useCallback, useRef } from 'react';
import { Point, calculateAngle } from '@/lib/poseUtils';
import { audioCoach } from '@/lib/audioFeedback';
import { calculateTrajectory, PhysicsResult, calculateReleaseAngle, estimateReleaseVelocity } from '@/lib/physics';

type ShotState = 'IDLE' | 'SET' | 'RELEASE';
type TrackingStatus = 'SEARCHING' | 'TRACKING' | 'LOCKED';

export function useShotAnalysis() {
    const [state, setState] = useState<ShotState>('IDLE');
    const [feedback, setFeedback] = useState<string>("Get Ready");
    const [angle, setAngle] = useState<number>(0);
    const [isPerfect, setIsPerfect] = useState<boolean>(false);
    const [status, setStatus] = useState<TrackingStatus>('SEARCHING');
    const [guidance, setGuidance] = useState<string>("");

    // Smoothing State
    const angleBufferRef = useRef<number[]>([]);
    const BUFFER_SIZE = 5; // Moving average window

    // Physics State
    const [lastPhysics, setLastPhysics] = useState<PhysicsResult | undefined>(undefined);
    const prevWristRef = useRef<{ x: number, y: number } | null>(null);
    const prevTimeRef = useRef<number>(0);

    const analyzeFrame = useCallback((landmarks: Point[]) => {
        if (!landmarks || landmarks.length < 33) return;

        // Visibility
        const vis = (p: Point) => p?.visibility ?? 0;
        const isVis = (p: Point) => vis(p) > 0.4; // STRICTER VISIBILITY

        // Smart Arm Selection
        const rShoulder = landmarks[12], rElbow = landmarks[14], rWrist = landmarks[16];
        const lShoulder = landmarks[11], lElbow = landmarks[13], lWrist = landmarks[15];
        const rHip = landmarks[24]; // Use right hip for right arm
        const lHip = landmarks[23]; // Use left hip for left arm

        const rConf = (vis(rShoulder) + vis(rElbow) + vis(rWrist)) / 3;
        const lConf = (vis(lShoulder) + vis(lElbow) + vis(lWrist)) / 3;

        const useRight = rConf >= lConf;
        const shoulder = useRight ? rShoulder : lShoulder;
        const elbow = useRight ? rElbow : lElbow;
        const wrist = useRight ? rWrist : lWrist;
        const hip = useRight ? rHip : lHip;

        // Tracking Check
        if (!isVis(elbow) || !isVis(shoulder)) {
            setStatus('SEARCHING');
            setFeedback("Show Your Form");
            setAngle(0);
            angleBufferRef.current = []; // Reset buffer

            if (rConf < 0.2 && lConf < 0.2) setGuidance("Step back to show arm");
            else setGuidance("Adjust camera angle");
            return;
        }

        setStatus('LOCKED');
        setGuidance("");

        // Calculate Angle
        let rawAngle = calculateAngle(shoulder, elbow, wrist);

        // --- SMOOTHING ---
        angleBufferRef.current.push(rawAngle);
        if (angleBufferRef.current.length > BUFFER_SIZE) {
            angleBufferRef.current.shift();
        }
        const smoothedAngle = Math.round(
            angleBufferRef.current.reduce((a, b) => a + b, 0) / angleBufferRef.current.length
        );

        setAngle(smoothedAngle);

        // Velocity Tracking (Pixels per second)
        const now = Date.now();
        const dt = (now - prevTimeRef.current) / 1000;
        let velocity = 0;

        if (prevWristRef.current && dt > 0) {
            const dx = wrist.x - prevWristRef.current.x;
            const dy = wrist.y - prevWristRef.current.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            velocity = dist / dt; // Normalized pixels per second
        }

        prevWristRef.current = { x: wrist.x, y: wrist.y };
        prevTimeRef.current = now;

        // State Machine
        const isArmRaised = elbow.y < hip.y;

        if (!isArmRaised) {
            if (state !== 'IDLE') {
                setState('IDLE');
                setFeedback("Ready Position");
                setIsPerfect(false);
            }
            return;
        }

        // SET PHASE (< 120 degrees)
        if (smoothedAngle < 120) {
            setState('SET');

            // STRICT FORM CHECK (85-95 degrees ideal)
            if (smoothedAngle < 70) {
                setFeedback("TOO TIGHT");
                setIsPerfect(false);
                audioCoach.speak('tooTight');
            } else if (smoothedAngle > 110) {
                setFeedback("TUCK ELBOW");
                setIsPerfect(false);
                audioCoach.speak('elbowTuck');
            } else if (smoothedAngle >= 85 && smoothedAngle <= 95) {
                setFeedback("PERFECT FORM");
                setIsPerfect(true);
            } else {
                setFeedback("ADJUST ELBOW"); // 70-85 or 95-110
                setIsPerfect(false);
            }
        }
        // RELEASE PHASE (> 140 degrees)
        else if (smoothedAngle > 140) {
            if (state === 'SET') {
                setState('RELEASE');

                // FINAL SHOT EVALUATION
                // 1. Angle Check
                const angleOk = lastPhysics ? (lastPhysics.releaseAngle > 40 && lastPhysics.releaseAngle < 60) : true;

                // 2. Velocity Check (prevent slow pushing)
                const velocityOk = velocity > 0.8; // Threshold based on normalized coords

                // 3. Form Check
                const isGoodShot = isPerfect && angleOk && velocityOk;

                // Physics Calculation
                const releaseAngle = calculateReleaseAngle(shoulder, wrist);
                const releaseVel = estimateReleaseVelocity(smoothedAngle);
                const trajectory = calculateTrajectory(1.8, releaseAngle, releaseVel);
                setLastPhysics(trajectory);

                // Feedback
                if (isGoodShot) {
                    setFeedback("SPLASH! 🎯");
                    audioCoach.speak('perfect');
                } else if (!isPerfect) {
                    setFeedback("FIX ELBOW ⚠️");
                } else if (!velocityOk) {
                    setFeedback("TOO SLOW ⚠️");
                    audioCoach.speak('power');
                } else {
                    setFeedback("OFF TARGET ⚠️");
                    audioCoach.speak('arc');
                }

                setIsPerfect(isGoodShot);
            }
        }
    }, [state, isPerfect, lastPhysics]);

    return {
        analyzeFrame,
        angle,
        state,
        feedback,
        isPerfect,
        status,
        guidance,
        lastPhysics
    };
}
