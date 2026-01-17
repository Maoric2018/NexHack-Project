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
    const velocityBufferRef = useRef<number[]>([]);

    // Metrics State for Graph
    const [metrics, setMetrics] = useState<{ velocity: number, acceleration: number }>({ velocity: 0, acceleration: 0 });

    // Anti-Flicker Hysteresis
    const lostFrameCountRef = useRef<number>(0);
    const LOST_FRAME_THRESHOLD = 8; // Require 8 frames of low confidence before switching to SEARCHING

    // Shot Cooldown - Prevent rapid fire
    const lastShotTimeRef = useRef<number>(0);
    const SHOT_COOLDOWN_MS = 1500; // 1.5 seconds between shots

    const analyzeFrame = useCallback((landmarks: Point[]) => {
        if (!landmarks || landmarks.length < 33) return;

        // Visibility (LOWERED threshold for better detection)
        const vis = (p: Point) => p?.visibility ?? 0;
        const isVis = (p: Point) => vis(p) > 0.25; // Was 0.4, now more lenient

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

        // Tracking Check with HYSTERESIS
        if (!isVis(elbow) || !isVis(shoulder)) {
            lostFrameCountRef.current++;

            // Only switch to SEARCHING after N consecutive bad frames
            if (lostFrameCountRef.current >= LOST_FRAME_THRESHOLD) {
                setStatus('SEARCHING');
                setFeedback("Show Your Form");
                setAngle(0);
                angleBufferRef.current = []; // Reset buffer
                velocityBufferRef.current = [];

                if (rConf < 0.2 && lConf < 0.2) setGuidance("Step back to show arm");
                else setGuidance("Adjust camera angle");
            }
            return;
        }

        // Good frame - reset lost counter
        lostFrameCountRef.current = 0;
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

        // --- PHYSICS ENGINE (Impulse Detection) ---
        const now = Date.now();
        const dt = (now - prevTimeRef.current) / 1000; // seconds

        let velocity = 0; // m/s (approx, normalized)
        let acceleration = 0; // m/s^2

        if (prevWristRef.current && dt > 0 && dt < 1.0) { // Limit dt to avoid jumps on frame drops
            // We focus on VERTICAL (Y) velocity for shot detection, as shots go UP.
            // Note: Canvas Y is inverted (0 is top), so UP is NEGATIVE delta.
            // We invert normalized Y so UP is POSITIVE for physics.
            const dy = (prevWristRef.current.y - wrist.y); // Positive = Moving UP
            const dx = Math.abs(wrist.x - prevWristRef.current.x);

            // Normalized speed
            const speed = Math.sqrt(dx * dx + dy * dy) / dt;

            // Smooth Velocity
            velocityBufferRef.current.push(speed);
            if (velocityBufferRef.current.length > 3) velocityBufferRef.current.shift();
            velocity = velocityBufferRef.current.reduce((a, b) => a + b, 0) / velocityBufferRef.current.length;

            // Simple Acceleration
            acceleration = (velocity - metrics.velocity) / dt;
        }

        setMetrics({ velocity, acceleration });

        prevWristRef.current = { x: wrist.x, y: wrist.y };
        prevTimeRef.current = now;

        // State Machine
        // RELAXED: Support sitting (if hip not visible, use shoulder + offset)
        const hipConf = Math.max(vis(rHip), vis(lHip));
        const isArmRaised = hipConf > 0.3
            ? elbow.y < hip.y // Standing: Elbow above hip
            : elbow.y < shoulder.y + 0.2; // Sitting/Close-up: Elbow near shoulder height (allow slight drop)

        if (!isArmRaised) {
            if (state !== 'IDLE') {
                setState('IDLE');
                setFeedback("Ready Position");
                setIsPerfect(false);
            }
            return;
        }

        // SET PHASE (< 120 degrees)
        if (state === 'IDLE' && smoothedAngle < 120) {
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
        // RELEASE DETECTION (Impulse Based)
        // 1. Must be in SET (or ready)
        // 2. Arm extending (Angle Opening)
        // 3. Vertical Velocity Spike (Impulse)
        // 4. Not in cooldown from last shot
        if (state === 'SET') {
            // LOWERED: Previous 0.5 was too high - many shots missed
            const VELOCITY_THRESHOLD = 0.15;
            const isExplosive = velocity > VELOCITY_THRESHOLD;
            // LOWERED: 100 degrees catches the release earlier in the motion
            const isExtending = smoothedAngle > 100;

            // Cooldown Check
            const now = Date.now();
            const timeSinceLastShot = now - lastShotTimeRef.current;
            const notInCooldown = timeSinceLastShot > SHOT_COOLDOWN_MS;

            if (isExplosive && isExtending && notInCooldown) {
                lastShotTimeRef.current = now; // Start cooldown
                setState('RELEASE');

                // --- EVALUATION ---
                const angleOk = smoothedAngle > 40; // Basic check
                const powerOk = velocity > 0.8 && velocity < 3.0; // Sweet spot
                const formOk = isPerfect;

                const releaseAngle = calculateReleaseAngle(shoulder, wrist);
                // Estimate real velocity based on normalized speed (assuming avg arm length)
                const releaseVel = velocity * 10; // Scalar to approx m/s
                const trajectory = calculateTrajectory(1.8, releaseAngle, releaseVel);
                setLastPhysics(trajectory);

                const isGoodShot = formOk && powerOk;

                if (isGoodShot) {
                    setFeedback(`SPLASH! ${(velocity * 10).toFixed(1)}m/s 🎯`);
                    audioCoach.speak('perfect');
                } else if (!formOk) {
                    setFeedback("FIX FORM ⚠️");
                } else if (!powerOk) {
                    setFeedback(velocity < 0.8 ? "TOO WEAK ⚠️" : "TOO HARD ⚠️");
                    audioCoach.speak('power');
                }

                setIsPerfect(isGoodShot);
            }
        }
    }, [state, isPerfect, lastPhysics, metrics]);

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
