// Physics calculations for basketball shot analysis

const GRAVITY = 9.81; // m/s²
const RIM_HEIGHT = 3.05; // meters
const FREE_THROW_DISTANCE = 4.19; // meters

export interface PhysicsResult {
    releaseAngle: number;      // degrees
    releaseVelocity: number;   // m/s
    arcHeight: number;         // meters
    timeOfFlight: number;      // seconds
    trajectoryPoints: { x: number; y: number; z: number }[];
}

export interface LandmarkPosition {
    x: number;
    y: number;
    z?: number;
}

/**
 * Calculate release angle from shoulder-elbow-wrist alignment
 * @param shoulder Shoulder position (normalized 0-1)
 * @param wrist Wrist position (normalized 0-1)
 * @returns Release angle in degrees (0 = horizontal, 90 = vertical)
 */
export function calculateReleaseAngle(shoulder: LandmarkPosition, wrist: LandmarkPosition): number {
    const dx = wrist.x - shoulder.x;
    const dy = shoulder.y - wrist.y; // Inverted because screen Y is down
    const angleRad = Math.atan2(dy, Math.abs(dx));
    return Math.round(angleRad * (180 / Math.PI));
}

/**
 * Estimate release velocity based on arm extension speed
 * This is a simplified model - real velocity would need frame-by-frame tracking
 * @param elbowAngle Elbow angle at release
 * @returns Estimated release velocity in m/s
 */
export function estimateReleaseVelocity(elbowAngle: number): number {
    // Ideal release is around 150° elbow extension
    // Velocity typically 7-9 m/s for free throws
    const extensionFactor = elbowAngle / 180;
    const baseVelocity = 7.5;
    return baseVelocity + extensionFactor * 2;
}

/**
 * Calculate ball trajectory using projectile motion equations
 * y(t) = y₀ + v₀·sin(θ)·t - ½·g·t²
 * x(t) = x₀ + v₀·cos(θ)·t
 */
/**
 * Calculate ball trajectory using projectile motion equations
 * NOW HANDLES MISSES REALISTICALLY
 */
export function calculateTrajectory(
    releaseHeight: number,
    releaseAngle: number,
    releaseVelocity: number,
    isMade: boolean = true,
    flawType?: 'low_arc' | 'high_arc' | 'left' | 'right' | 'short' | 'long'
): PhysicsResult {
    const angleRad = releaseAngle * (Math.PI / 180);
    let v0x = releaseVelocity * Math.cos(angleRad);
    let v0y = releaseVelocity * Math.sin(angleRad);
    const y0 = releaseHeight;

    // TARGET: The interaction point (rim or backboard)
    const RIM_HEIGHT = 3.05;
    const DISTANCE = 4.19;

    // IF MISSING: Adjust velocity/angle to force a miss
    if (!isMade) {
        // Randomize slight deviation for natural feel
        const noise = (Math.random() - 0.5) * 0.5;

        switch (flawType) {
            case 'short':
            case 'low_arc':
                // Reduce velocity -> Airball short or front rim
                v0x *= 0.85;
                v0y *= 0.9;
                break;
            case 'long':
            case 'high_arc':
                // Increase velocity -> Back rim or backboard
                v0x *= 1.15;
                break;
            case 'left':
                // Add lateral velocity (Z-axis in our 2D-to-3D mapping, but handled as X deviation in trajectory)
                // For simplicity in this 2D-focused math, we'll simulate "miss" by just not reaching correct depth
                // or returning a specialized 'miss' path if 3D scene supports it.
                // Here we just make it go weirdly short/long to show it's not "true"
                v0x *= 0.95 + noise;
                break;
            default:
                // Generic miss (rim out)
                v0x *= (Math.random() > 0.5 ? 1.05 : 0.95);
        }
    } else {
        // AUTO-CORRECT FOR MAKE: 
        // If it's a made shot, we define the trajectory to PASS THROUGH the hoop center
        // We retroactively fit the velocity to ensure it hits (0, 3.05, 4.19)

        // Solve for v required to hit (DISTANCE, RIM_HEIGHT) given angle
        // y = x tan(theta) - (g x^2) / (2 v^2 cos^2(theta))
        // v^2 = (g x^2) / (2 cos^2(theta) * (x tan(theta) - y + y0))

        const g = GRAVITY;
        const x = DISTANCE;
        const y = RIM_HEIGHT;
        const tanTheta = Math.tan(angleRad);
        const cosTheta = Math.cos(angleRad);

        const requiredVelocitySquared = (g * x * x) / (2 * cosTheta * cosTheta * (x * tanTheta - (y - y0)));

        if (requiredVelocitySquared > 0) {
            const requiredVelocity = Math.sqrt(requiredVelocitySquared);
            // Use this exact velocity for the "swish"
            v0x = requiredVelocity * Math.cos(angleRad);
            v0y = requiredVelocity * Math.sin(angleRad);
        }
    }

    // Calculate time to reach the distance (plus a bit for follow through)
    const timeToTarget = DISTANCE / v0x;
    const totalTime = timeToTarget * 1.2; // Continue past rim

    // Generate trajectory points
    const trajectoryPoints: { x: number; y: number; z: number }[] = [];
    const numPoints = 60;

    for (let i = 0; i <= numPoints; i++) {
        const t = totalTime * (i / numPoints);

        // Standard projectile motion
        const z = v0x * t; // Forward distance
        const y = y0 + v0y * t - 0.5 * GRAVITY * t * t;

        // Lateral deviation (x-axis)
        let x = 0;
        if (!isMade && flawType === 'left') x = -0.5 * (t / totalTime);
        if (!isMade && flawType === 'right') x = 0.5 * (t / totalTime);

        trajectoryPoints.push({ x, y, z });
    }

    // Recalculate derived metrics based on the utilized velocity
    const finalVelocity = Math.sqrt(v0x * v0x + v0y * v0y);
    const timeToApex = v0y / GRAVITY;
    const arcHeight = y0 + v0y * timeToApex - 0.5 * GRAVITY * timeToApex * timeToApex;

    return {
        releaseAngle,
        releaseVelocity: finalVelocity,
        arcHeight,
        timeOfFlight: timeToTarget,
        trajectoryPoints
    };
}

/**
 * Calculate shot quality score (0-100)
 */
export function calculateShotQuality(elbowAngle: number, releaseAngle: number): number {
    // Ideal elbow: 85-95°
    // Ideal release: 45-55°

    const elbowScore = 100 - Math.abs(elbowAngle - 90) * 2;
    const releaseScore = 100 - Math.abs(releaseAngle - 50) * 2;

    return Math.max(0, Math.min(100, (elbowScore * 0.6 + releaseScore * 0.4)));
}

/**
 * Harsh grading based on multiple metrics
 */
export function calculateHarshGrade(
    accuracy: number,           // 0-1
    avgElbowAngle: number,      // degrees
    angleStdDev: number         // degrees (consistency)
): 'S' | 'A' | 'B' | 'C' | 'D' | 'F' {
    // S: ≥95% accuracy, 85-95° avg, σ ≤5°
    // A: ≥85% accuracy, 80-100° avg, σ ≤10°
    // B: ≥70% accuracy, 70-110° avg, σ ≤15°
    // C: ≥50% accuracy
    // D: ≥30% accuracy
    // F: <30% accuracy

    const inIdealRange = avgElbowAngle >= 85 && avgElbowAngle <= 95;
    const inGoodRange = avgElbowAngle >= 80 && avgElbowAngle <= 100;
    const inAcceptableRange = avgElbowAngle >= 70 && avgElbowAngle <= 110;

    if (accuracy >= 0.95 && inIdealRange && angleStdDev <= 5) return 'S';
    if (accuracy >= 0.85 && inGoodRange && angleStdDev <= 10) return 'A';
    if (accuracy >= 0.70 && inAcceptableRange && angleStdDev <= 15) return 'B';
    if (accuracy >= 0.50) return 'C';
    if (accuracy >= 0.30) return 'D';
    return 'F';
}

/**
 * Calculate standard deviation
 */
export function standardDeviation(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squareDiffs = values.map(v => Math.pow(v - mean, 2));
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / values.length;
    return Math.sqrt(avgSquareDiff);
}
