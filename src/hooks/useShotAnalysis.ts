import { useState, useCallback, useRef } from 'react';
import { Point, calculateAngle } from '@/lib/poseUtils';
import { audioCoach } from '@/lib/audioFeedback';
import { calculateTrajectory, PhysicsResult, calculateReleaseAngle, estimateReleaseVelocity } from '@/lib/physics';

type ShotState = 'IDLE' | 'SET' | 'RELEASE';
type TrackingStatus = 'SEARCHING' | 'TRACKING' | 'LOCKED';

export function useShotAnalysis() {
    // Existing state declarations (needed for setters used in new analyzeFrame)
    const [state, setState] = useState<ShotState>('IDLE');
    const [feedback, setFeedback] = useState<string>("Get Ready");
    const [angle, setAngle] = useState<number>(0);
    const [isPerfect, setIsPerfect] = useState<boolean>(false);
    const [status, setStatus] = useState<TrackingStatus>('SEARCHING');
    const [guidance, setGuidance] = useState<string>(""); // Guidance is not explicitly set in new logic, but kept for consistency

    // Physics State
    const [lastPhysics, setLastPhysics] = useState<PhysicsResult | undefined>(undefined);

    // Metrics State for Graph
    const [metrics, setMetrics] = useState<{ velocity: number, acceleration: number }>({ velocity: 0, acceleration: 0 });

    // --- NEW STATE & HISTORY ---
    // Store full landmarks for 3D replay
    const framesRef = useRef<{ time: number, angle: number, wristY: number, landmarks: Point[] }[]>([]);
    const lastTriggerTimeRef = useRef<number>(0);
    const COOLDOWN_MS = 1000;

    const analyzeFrame = useCallback((landmarks: Point[]) => {
        if (!landmarks || landmarks.length < 33) return;
        const now = Date.now();

        // 1. Visibility & Keypoints
        const vis = (p: Point) => p?.visibility ?? 0;
        const rShoulder = landmarks[12], rElbow = landmarks[14], rWrist = landmarks[16];
        const lShoulder = landmarks[11], lElbow = landmarks[13], lWrist = landmarks[15];

        // Auto-detect side
        const rConf = (vis(rShoulder) + vis(rElbow) + vis(rWrist)) / 3;
        const lConf = (vis(lShoulder) + vis(lElbow) + vis(lWrist)) / 3;
        const useRight = rConf >= lConf;

        const shoulder = useRight ? rShoulder : lShoulder;
        const elbow = useRight ? rElbow : lElbow;
        const wrist = useRight ? rWrist : lWrist;

        // Basic Tracking Check (Relaxed for sitting)
        if (vis(elbow) < 0.3 || vis(wrist) < 0.3) {
            setStatus('SEARCHING');
            setFeedback("LOST TRACKING");
            setAngle(0);
            return;
        }
        setStatus('LOCKED');

        // 2. Metrics Calculation
        const rawAngle = calculateAngle(shoulder, elbow, wrist);
        const currentWristY = wrist.y;

        // Update Buffer (Keep last 2 seconds approx 60 frames)
        // NOW STORING FULL LANDMARKS
        framesRef.current.push({ time: now, angle: rawAngle, wristY: currentWristY, landmarks: landmarks });
        if (framesRef.current.length > 100) framesRef.current.shift(); // Increased buffer size

        // Smooth angle for UI
        const smoothedAngle = Math.round(
            framesRef.current.slice(-5).reduce((a, b) => a + b.angle, 0) / Math.min(5, framesRef.current.length)
        );
        setAngle(smoothedAngle);

        // 3. SEQUENCE DETECTION ENGINE
        if (now - lastTriggerTimeRef.current < COOLDOWN_MS) return; // Cooldown

        const currentFrame = framesRef.current[framesRef.current.length - 1];

        if (currentFrame.angle > 135) { // Release
            // Search backward
            const lookbackWindow = framesRef.current.filter(f => now - f.time < 600);
            const setPoint = lookbackWindow.find(f => f.angle < 100);

            if (setPoint) {
                const verticalTravel = setPoint.wristY - currentFrame.wristY;
                const isUpward = verticalTravel > 0.05;

                if (isUpward) {
                    // SHOT DETECTED!
                    lastTriggerTimeRef.current = now;
                    setState('RELEASE');

                    // Extract Motion Data (From Set Point - 500ms to Now + 500ms? No, stick to what we have)
                    // We grab the last 1.5 seconds to capture the full setup and follow through
                    const shotMotion = framesRef.current
                        .filter(f => now - f.time < 1500)
                        .map(f => f.landmarks);

                    // Physics
                    const dt = (currentFrame.time - setPoint.time) / 1000;
                    const velocity = verticalTravel / dt;
                    const isFormPerfect = setPoint.angle > 80 && setPoint.angle < 110;

                    setIsPerfect(isFormPerfect);
                    setFeedback(isFormPerfect ? "SPLASH! 🎯" : "GOOD EXTENSION");
                    audioCoach.speak(isFormPerfect ? 'perfect' : 'goodShot');

                    setMetrics({ velocity: velocity, acceleration: velocity / dt });
                    setLastPhysics({
                        releaseAngle: currentFrame.angle,
                        releaseVelocity: velocity * 10,
                        trajectoryPoints: [],
                        arcHeight: 0,
                        timeOfFlight: 0
                    });

                    // Trigger callback with motion data (via return, managed by Pipeline)
                    // We attach it to the ephemeral state return effectively, but clearer to just expose it

                    // Reset
                    setTimeout(() => setState('IDLE'), 500);

                    return { shotMotion }; // Return specialized data for this one frame
                }
            }
        } else if (smoothedAngle < 100) {
            setState('SET');
            if (smoothedAngle < 60) setFeedback("TOO TIGHT");
            else setFeedback("READY");
        } else {
            setState('IDLE');
        }

    }, [audioCoach]);

    return {
        analyzeFrame,
        angle,
        state,
        feedback,
        isPerfect,
        status,
        guidance,
        lastPhysics,
        metrics
    };
}
