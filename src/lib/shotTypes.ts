import { PhysicsResult } from './physics';

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

// Shot record type for tracking individual shots
export interface ShotRecord {
    id: number;
    timestamp: number;
    elbowAngle: number;
    isPerfect: boolean;
    feedback: string;
    // Video Sync
    videoTimestamp: number; // Time in seconds from session start
    // Motion Capture Data (Array of frames, each frame has 33 landmarks)
    motionData?: { x: number; y: number; z?: number; visibility?: number }[][];
    trajectory?: PhysicsResult;
    metrics?: ShotMetrics;
}

// Session data for Film Room
export interface SessionSummary {
    shots: ShotRecord[];
    totalShots: number;
    perfectShots: number;
    averageAngle: number;
    bestStreak: number;
    grade: 'S' | 'A' | 'B' | 'C';
}

// Calculate grade based on multiple factors
export function calculateGrade(
    accuracy: number,
    averageAngle: number,
    consistency: number
): 'S' | 'A' | 'B' | 'C' {
    // Angle quality: 85-95 is ideal
    const angleQuality = 1 - Math.abs(averageAngle - 90) / 90;

    // Weighted score
    const score = (accuracy * 0.6) + (angleQuality * 0.2) + (consistency * 0.2);

    if (score >= 0.85) return 'S';
    if (score >= 0.70) return 'A';
    if (score >= 0.50) return 'B';
    return 'C';
}

// Generate coach advice based on shot data
export function generateCoachAdvice(summary: SessionSummary): string {
    const { averageAngle, perfectShots, totalShots, shots } = summary;
    const accuracy = totalShots > 0 ? perfectShots / totalShots : 0;

    const tips: string[] = [];

    // Angle analysis
    if (averageAngle < 80) {
        tips.push("Your elbow is too tucked. Aim for a 90° angle at the set position.");
    } else if (averageAngle > 100) {
        tips.push("Your elbow is flaring out. Focus on keeping it under the ball.");
    } else {
        tips.push("Great elbow positioning! Your form fundamentals are solid.");
    }

    // Consistency analysis
    if (shots.length >= 3) {
        const angles = shots.map(s => s.elbowAngle);
        const variance = Math.sqrt(angles.reduce((sum, a) => sum + Math.pow(a - averageAngle, 2), 0) / angles.length);
        if (variance > 15) {
            tips.push("Work on consistency - your form varies shot to shot.");
        } else {
            tips.push("Excellent consistency in your shooting motion!");
        }
    }

    // Accuracy feedback
    if (accuracy >= 0.8) {
        tips.push("Outstanding accuracy! You're ready for game situations.");
    } else if (accuracy >= 0.5) {
        tips.push("Good progress. Focus on muscle memory through repetition.");
    } else {
        tips.push("Keep practicing! Slow down and focus on form before speed.");
    }

    return tips.join(" ");
}
