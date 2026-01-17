import { useState, useCallback, useEffect } from 'react';
import { Point, calculateAngle } from '@/lib/poseUtils';
import { audioCoach } from '@/lib/audioFeedback';

type ShotState = 'IDLE' | 'SET' | 'RELEASE';

interface AnalysisResult {
    angle: number;
    state: ShotState;
    feedback: string;
    isPerfect: boolean;
}

export function useShotAnalysis() {
    const [state, setState] = useState<ShotState>('IDLE');
    const [feedback, setFeedback] = useState<string>("Align Camera");
    const [angle, setAngle] = useState<number>(0);
    const [isPerfect, setIsPerfect] = useState<boolean>(false);

    const analyzeFrame = useCallback((landmarks: Point[]) => {
        if (!landmarks || landmarks.length < 33) return;

        // Right side indices
        const shoulder = landmarks[12];
        const elbow = landmarks[14];
        const wrist = landmarks[16];
        const hip = landmarks[24];

        // 1. Calculate Elbow Angle
        const elbowAngle = calculateAngle(shoulder, elbow, wrist);
        setAngle(Math.round(elbowAngle));

        // 2. Simple State Machine
        // SET: Elbow is raised (y < hip.y) AND angle is roughly 90 (70-110)
        // RELEASE: Elbow extends (> 140)

        const isArmRaised = elbow.y < hip.y; // Y is inverted in canvas usually? 0 is top. Yes.

        if (!isArmRaised) {
            setState('IDLE');
            setFeedback("Raise Ball");
            setIsPerfect(false);
            return;
        }

        // Determine State
        if (elbowAngle < 120) {
            setState('SET');

            // Analyze Form in SET position
            if (elbowAngle > 110) {
                setFeedback("TUCK ELBOW");
                audioCoach.speak("Tuck your elbow");
                setIsPerfect(false);
            } else if (elbowAngle < 70) {
                setFeedback("TOO TIGHT");
                audioCoach.speak("Too tight");
                setIsPerfect(false);
            } else {
                setFeedback("PERFECT SET");
                setIsPerfect(true);
            }
        } else if (elbowAngle > 140) {
            // Extension phase
            if (state === 'SET') {
                setState('RELEASE');
                audioCoach.speak("Nice release");
                setFeedback("RELEASED");
            }
        }
    }, [state]);

    return { analyzeFrame, angle, state, feedback, isPerfect };
}
