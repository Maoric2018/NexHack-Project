import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { totalShots, perfectShots, averageAngle } = body;

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

        // Accuracy feedback
        if (accuracy >= 0.8) {
            tips.push("Outstanding accuracy! You're ready for game situations.");
        } else if (accuracy >= 0.5) {
            tips.push("Good progress. Focus on muscle memory through repetition.");
        } else {
            tips.push("Keep practicing! Slow down and focus on form before speed.");
        }

        return NextResponse.json({
            advice: tips.join(" "),
            accuracy: Math.round(accuracy * 100),
            averageAngle
        });

    } catch {
        return NextResponse.json({
            advice: "Great session! Focus on consistency for even better results."
        });
    }
}
