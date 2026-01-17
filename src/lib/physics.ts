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
export function calculateTrajectory(
    releaseHeight: number,
    releaseAngle: number,
    releaseVelocity: number
): PhysicsResult {
    const angleRad = releaseAngle * (Math.PI / 180);
    const v0x = releaseVelocity * Math.cos(angleRad);
    const v0y = releaseVelocity * Math.sin(angleRad);

    // Solve for time when ball reaches rim height at rim distance
    // This is a quadratic: -½gt² + v0y·t + (y0 - yrim) = 0
    // We'll use the positive root (ascending arc hits rim)

    const y0 = releaseHeight;
    const yFinal = RIM_HEIGHT;
    const xFinal = FREE_THROW_DISTANCE;

    // Time to reach rim distance
    const timeToRim = xFinal / v0x;

    // Height at rim
    const heightAtRim = y0 + v0y * timeToRim - 0.5 * GRAVITY * timeToRim * timeToRim;

    // Calculate arc height (max y)
    const timeToApex = v0y / GRAVITY;
    const arcHeight = y0 + v0y * timeToApex - 0.5 * GRAVITY * timeToApex * timeToApex;

    // Generate trajectory points
    const trajectoryPoints: { x: number; y: number; z: number }[] = [];
    const numPoints = 50;

    for (let i = 0; i <= numPoints; i++) {
        const t = (timeToRim * 1.1) * (i / numPoints); // Go slightly past rim
        const x = v0x * t;
        const y = y0 + v0y * t - 0.5 * GRAVITY * t * t;
        trajectoryPoints.push({ x: 0, y, z: x }); // z is forward in our 3D scene
    }

    return {
        releaseAngle,
        releaseVelocity,
        arcHeight,
        timeOfFlight: timeToRim,
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
