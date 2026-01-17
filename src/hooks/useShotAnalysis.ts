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

    // Frame history
    const framesRef = useRef<{ time: number, angle: number, wristY: number, landmarks: Point[] }[]>([]);
    const lastTriggerTimeRef = useRef<number>(0);
    const wasInSetRef = useRef<boolean>(false);
    const setStartTimeRef = useRef<number>(0);
    const setAngleRef = useRef<number>(0);

    const analyzeFrame = useCallback((landmarks: Point[]) => {
        if (!landmarks || landmarks.length < 33) return;
        const now = Date.now();
        const vis = (p: Point) => p?.visibility ?? 0;

        // 1. ANATOMY & ORIENTATION
        const rShoulder = landmarks[12], rElbow = landmarks[14], rWrist = landmarks[16];
        const lShoulder = landmarks[11], lElbow = landmarks[13], lWrist = landmarks[15];
        const nose = landmarks[0];

        // Detect Side Profile vs Front
        // If shoulder distance (x-axis) is small relative to arm length -> Side View
        const shoulderDist = Math.abs(rShoulder.x - lShoulder.x);
        const refArmLen = Math.abs(rShoulder.y - rElbow.y) + Math.abs(rElbow.y - rWrist.y); // Vertical approx
        const isSideView = shoulderDist < (refArmLen * 0.4);

        // Determine shooting arm
        // - Front view: Dominant (more visible)
        // - Side view: The "forward" arm (one with Wrist X in direction of gaze? or just most visible)
        // We'll stick to visibility confidence for now, but side view often occludes one.
        const rConf = (vis(rShoulder) + vis(rElbow) + vis(rWrist)) / 3;
        const lConf = (vis(lShoulder) + vis(lElbow) + vis(lWrist)) / 3;
        const useRight = rConf >= lConf;

        const shoulder = useRight ? rShoulder : lShoulder;
        const elbow = useRight ? rElbow : lElbow;
        const wrist = useRight ? rWrist : lWrist;

        // Tracking Valid Check
        if (vis(elbow) < 0.3 || vis(wrist) < 0.3) {
            setStatus('SEARCHING');
            setFeedback(isSideView ? "SIDE VIEW DETECTED" : "SHOW SHOOTING ARM");
            return;
        }
        setStatus(isSideView ? 'TRACKING' : 'LOCKED'); // Just visual feedback variance

        // Calculate Angle
        const rawAngle = calculateAngle(shoulder, elbow, wrist);
        const currentWristY = wrist.y;

        // Store Frame
        framesRef.current.push({ time: now, angle: rawAngle, wristY: currentWristY, landmarks });
        if (framesRef.current.length > 90) framesRef.current.shift();

        // Smooth Angle
        const recentFrames = framesRef.current.slice(-3);
        const smoothedAngle = Math.round(recentFrames.reduce((a, b) => a + b.angle, 0) / recentFrames.length);
        setAngle(smoothedAngle);

        // COOLDOWN
        if (now - lastTriggerTimeRef.current < 1500) return;

        // 2. DETECTION LOGIC (Robust)
        const SET_THRESHOLD = isSideView ? 110 : 100; // Allow wider set in side view
        const RELEASE_THRESHOLD = 135; // Must extend arm significantly

        // PHASE 1: SET (Cocked Arm)
        if (rawAngle < SET_THRESHOLD) {
            if (!wasInSetRef.current) {
                // VALIDATE SET: Wrist shouldn't be too low (not by hip)
                if (wrist.y < shoulder.y + 0.2) { // Remember Y is inverted (0 is top), so < means higher or slightly below shoulder
                    wasInSetRef.current = true;
                    setStartTimeRef.current = now;
                    setAngleRef.current = rawAngle;
                    setState('SET');
                    setFeedback("READY... 🎯");
                }
            }
        }

        // PHASE 2: RELEASE (Extension)
        if (wasInSetRef.current && rawAngle > RELEASE_THRESHOLD) {
            const setDuration = now - setStartTimeRef.current;

            // FILTER: Timing must be shot-like (100ms - 1.5s)
            if (setDuration > 100 && setDuration < 1500) {
                // FILTER: CRITICAL - Wrist must end HIGH (above head level or at least shoulder)
                // Inverted Y: Lower value is higher on screen
                const isHighRelease = wrist.y < (nose.y + 0.1);

                if (isHighRelease) {
                    // === SHOT CONFIRMED ===
                    lastTriggerTimeRef.current = now;

                    // 3. FLAW ANALYSIS & CRITIQUE
                    const shotFrames = framesRef.current.filter(f => now - f.time < 1500);
                    const motionData = shotFrames.map(f => f.landmarks);

                    // Metrics
                    const extensionSpeed = (rawAngle - setAngleRef.current) / (setDuration / 1000);
                    const startWristY = shotFrames[0]?.wristY || currentWristY;
                    const verticalLift = startWristY - currentWristY; // Positive = up

                    // -- Critique Logic --
                    let flaw: 'low_arc' | 'short' | 'long' | 'left' | 'right' | undefined;
                    let critiqueType: 'perfect' | 'elbowTuck' | 'tooTight' | 'arc' | 'power' | 'goodShot' = 'goodShot';

                    // Check 1: Elbow Flare (if front view)
                    // If elbow X is far from shoulder X
                    if (!isSideView && Math.abs(elbow.x - shoulder.x) > 0.15) {
                        flaw = Math.random() > 0.5 ? 'left' : 'right'; // Flare causes lateral miss
                        critiqueType = 'elbowTuck';
                    }
                    // Check 2: Stiffness/Tightness (Set angle too small)
                    else if (setAngleRef.current < 45) {
                        flaw = 'short'; // constrained motion
                        critiqueType = 'tooTight';
                    }
                    // Check 3: Power/Extension Speed
                    else if (extensionSpeed < 150) {
                        flaw = 'short';
                        critiqueType = 'power';
                    }
                    // Check 4: Arc (Release Angle approximation)
                    // If wrist y is barely above nose, likely flat shot
                    else if (wrist.y > nose.y - 0.05) {
                        flaw = 'low_arc';
                        critiqueType = 'arc';
                    }
                    // Check 5: Perfect?
                    // Good speed, good height, no flare
                    else if (extensionSpeed > 300 && verticalLift > 0.15) {
                        critiqueType = 'perfect';
                    }

                    const isMade = critiqueType === 'perfect' || critiqueType === 'goodShot';
                    const formScore = isMade ? (critiqueType === 'perfect' ? 95 : 85) : 60; // Simplified scoring

                    // Build Metrics
                    const shotMetrics: ShotMetrics = {
                        loadTime: 0,
                        releaseTime: setDuration,
                        setAngle: Math.round(setAngleRef.current),
                        releaseAngle: Math.round(rawAngle),
                        armExtensionSpeed: Math.round(extensionSpeed),
                        wristVelocity: verticalLift / (setDuration / 1000),
                        verticalLift: Math.round(verticalLift * 100),
                        releaseHeight: Math.round((1 - currentWristY) * 100),
                        formScore,
                        isGoodForm: isMade
                    };

                    // Physics with Flaw
                    // Estimate velocity & angle from motion
                    const estVel = Math.max(5, Math.min(11, 5 + extensionSpeed / 120));
                    const estAng = Math.max(40, Math.min(65, 45 + (verticalLift * 40)));

                    const physics = calculateTrajectory(
                        2.0, // approx release height relative to floor
                        estAng,
                        estVel,
                        isMade,
                        flaw
                    );

                    // Update State
                    setIsPerfect(isMade);
                    setFeedback(isMade ? (critiqueType === 'perfect' ? "PERFECT! 🏀" : "NICE SHOT") : "ADJUST FORM");
                    setState('RELEASE');

                    // 🗣️ AUDIO CRITIQUE
                    audioCoach.speak(critiqueType);

                    setLastPhysics(physics);
                    setLastMotionData(motionData);
                    setLastShotMetrics(shotMetrics);
                    setMetrics({ velocity: shotMetrics.wristVelocity, acceleration: extensionSpeed });

                    setTimeout(() => {
                        setState('IDLE');
                        setFeedback("READY");
                    }, 500);
                } else {
                    // Rejected: Not high enough (false positive extension like a handshake)
                    wasInSetRef.current = false;
                    setState('IDLE');
                    setFeedback("REACH HIGHER");
                }
            } else {
                wasInSetRef.current = false; // Too fast/slow
            }
        }

        // Timeout Reset
        if (wasInSetRef.current && now - setStartTimeRef.current > 3000) {
            wasInSetRef.current = false;
            setState('IDLE');
            setFeedback("READY");
        }

        // Pre-Set Feedback
        if (!wasInSetRef.current && rawAngle > SET_THRESHOLD && rawAngle < RELEASE_THRESHOLD) {
            // Only show if wrist is somewhat high (upright stance)
            if (wrist.y < shoulder.y + 0.3) {
                setFeedback(`${Math.round(rawAngle)}° - Bend more`);
            }
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
