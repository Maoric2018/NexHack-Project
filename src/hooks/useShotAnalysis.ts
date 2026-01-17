import { useState, useCallback, useRef } from 'react';
import { Point, calculateAngle } from '@/lib/poseUtils';
import { audioCoach } from '@/lib/audioFeedback';
import { PhysicsResult, calculateTrajectory, calculateShotQuality } from '@/lib/physics';

type ShotState = 'IDLE' | 'SET' | 'RELEASE';
type TrackingStatus = 'SEARCHING' | 'TRACKING' | 'LOCKED';

// Rich metrics for each shot
export interface ShotMetrics {
    loadTime: number;
    releaseTime: number;
    setAngle: number;
    releaseAngle: number;
    armExtensionSpeed: number;
    wristVelocity: number;
    verticalLift: number;
    releaseHeight: number;
    formScore: number;
    isGoodForm: boolean;
}

export function useShotAnalysis() {
    const [state, setState] = useState<ShotState>('IDLE');
    const [feedback, setFeedback] = useState<string>("Get Ready");
    const [angle, setAngle] = useState<number>(0);
    const [isPerfect, setIsPerfect] = useState<boolean>(false);
    const [status, setStatus] = useState<TrackingStatus>('SEARCHING');
    const [guidance, setGuidance] = useState<string>("");
    const [lastPhysics, setLastPhysics] = useState<PhysicsResult | undefined>(undefined);
    const [metrics, setMetrics] = useState<{ velocity: number, acceleration: number }>({ velocity: 0, acceleration: 0 });
    const [lastMotionData, setLastMotionData] = useState<Point[][] | undefined>(undefined);
    const [lastShotMetrics, setLastShotMetrics] = useState<ShotMetrics | undefined>(undefined);

    // Simple frame history
    const framesRef = useRef<{ time: number, angle: number, wristY: number, landmarks: Point[] }[]>([]);
    const lastTriggerTimeRef = useRef<number>(0);
    const wasInSetRef = useRef<boolean>(false);
    const setStartTimeRef = useRef<number>(0);
    const setAngleRef = useRef<number>(0);

    const analyzeFrame = useCallback((landmarks: Point[]) => {
        if (!landmarks || landmarks.length < 33) return;
        const now = Date.now();

        const vis = (p: Point) => p?.visibility ?? 0;

        // Get both arms
        const rShoulder = landmarks[12], rElbow = landmarks[14], rWrist = landmarks[16];
        const lShoulder = landmarks[11], lElbow = landmarks[13], lWrist = landmarks[15];

        // Auto-detect dominant arm (pick the more visible one)
        const rConf = (vis(rShoulder) + vis(rElbow) + vis(rWrist)) / 3;
        const lConf = (vis(lShoulder) + vis(lElbow) + vis(lWrist)) / 3;
        const useRight = rConf >= lConf;

        const shoulder = useRight ? rShoulder : lShoulder;
        const elbow = useRight ? rElbow : lElbow;
        const wrist = useRight ? rWrist : lWrist;

        // TRACKING CHECK - Very relaxed
        if (vis(elbow) < 0.2 || vis(wrist) < 0.2) {
            setStatus('SEARCHING');
            setFeedback("SHOW YOUR ARM");
            return;
        }
        setStatus('LOCKED');

        // Calculate current elbow angle
        const rawAngle = calculateAngle(shoulder, elbow, wrist);
        const currentWristY = wrist.y;

        // Store frame
        framesRef.current.push({ time: now, angle: rawAngle, wristY: currentWristY, landmarks });
        if (framesRef.current.length > 90) framesRef.current.shift(); // 3 sec @ 30fps

        // Smooth angle for display
        const recentFrames = framesRef.current.slice(-3);
        const smoothedAngle = Math.round(recentFrames.reduce((a, b) => a + b.angle, 0) / recentFrames.length);
        setAngle(smoothedAngle);

        // COOLDOWN CHECK (1 second between shots)
        if (now - lastTriggerTimeRef.current < 1000) {
            setFeedback("NICE! 🔥");
            return;
        }

        // ========== SIMPLE DETECTION LOGIC ==========
        // 
        // Shot = arm goes from bent (< 100°) to extended (> 120°)
        // That's it. Simple.
        //

        const SET_THRESHOLD = 100;      // Arm bent = less than this
        const RELEASE_THRESHOLD = 120;  // Arm extended = more than this

        // Phase 1: Detect when arm is cocked/bent
        if (rawAngle < SET_THRESHOLD) {
            if (!wasInSetRef.current) {
                // Just entered set position
                wasInSetRef.current = true;
                setStartTimeRef.current = now;
                setAngleRef.current = rawAngle;
                setState('SET');
                setFeedback("READY... 🎯");
            }
        }

        // Phase 2: Detect release (arm extends)
        if (wasInSetRef.current && rawAngle > RELEASE_THRESHOLD) {
            // SHOT DETECTED!
            const shotDuration = now - setStartTimeRef.current;

            // Only count if the set phase was at least 100ms (not just noise)
            if (shotDuration > 100 && shotDuration < 2000) {
                lastTriggerTimeRef.current = now;

                // Get motion data from last second
                const shotFrames = framesRef.current.filter(f => now - f.time < 1500);
                const motionData = shotFrames.map(f => f.landmarks);

                // Calculate metrics
                const extensionSpeed = (rawAngle - setAngleRef.current) / (shotDuration / 1000);
                const firstWristY = shotFrames.length > 0 ? shotFrames[0].wristY : currentWristY;
                const verticalLift = firstWristY - currentWristY; // Positive = moved up

                // Form quality
                const formScore = calculateShotQuality(setAngleRef.current, rawAngle);
                const isGoodForm = formScore >= 60;

                // Build metrics
                const shotMetrics: ShotMetrics = {
                    loadTime: 0,
                    releaseTime: shotDuration,
                    setAngle: Math.round(setAngleRef.current),
                    releaseAngle: Math.round(rawAngle),
                    armExtensionSpeed: Math.round(extensionSpeed),
                    wristVelocity: verticalLift / (shotDuration / 1000),
                    verticalLift: Math.round(verticalLift * 100),
                    releaseHeight: Math.round((1 - currentWristY) * 100),
                    formScore: Math.round(formScore),
                    isGoodForm
                };

                // Physics
                const estimatedReleaseHeight = 1.5 + (1 - currentWristY) * 0.7;
                const dx = wrist.x - shoulder.x;
                const dy = shoulder.y - wrist.y;
                const releaseAngleDeg = Math.max(30, Math.min(60, Math.atan2(dy, Math.abs(dx)) * (180 / Math.PI)));
                const estimatedVelocity = Math.max(5, Math.min(10, 5 + extensionSpeed / 150));

                const physics = calculateTrajectory(estimatedReleaseHeight, releaseAngleDeg, estimatedVelocity);

                // Update all state
                setIsPerfect(isGoodForm);
                setFeedback(isGoodForm ? "SPLASH! 💦" : "GOOD SHOT!");
                setState('RELEASE');
                audioCoach.speak(isGoodForm ? 'perfect' : 'goodShot');

                setLastPhysics(physics);
                setLastMotionData(motionData);
                setLastShotMetrics(shotMetrics);
                setMetrics({ velocity: shotMetrics.wristVelocity, acceleration: extensionSpeed });

                // Reset for next shot
                setTimeout(() => {
                    setState('IDLE');
                    setFeedback("READY");
                }, 500);
            }

            // Reset set phase
            wasInSetRef.current = false;
        }

        // Timeout: If in set for too long, reset
        if (wasInSetRef.current && now - setStartTimeRef.current > 3000) {
            wasInSetRef.current = false;
            setState('IDLE');
            setFeedback("READY");
        }

        // Show current state feedback
        if (!wasInSetRef.current && rawAngle > SET_THRESHOLD && rawAngle < RELEASE_THRESHOLD) {
            setFeedback(`${Math.round(rawAngle)}° - Bend more`);
        }

    }, []);

    return {
        analyzeFrame,
        angle,
        state,
        feedback,
        isPerfect,
        status,
        guidance,
        lastPhysics,
        metrics,
        lastMotionData,
        lastShotMetrics
    };
}
