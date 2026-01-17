import { NormalizedLandmark } from "@mediapipe/pose";

export interface Point {
    x: number;
    y: number;
    z?: number;
    visibility?: number;
}

/**
 * Calculates the angle between three points (A, B, C) where B is the vertex.
 */
export function calculateAngle(a: Point, b: Point, c: Point): number {
    if (!a || !b || !c) return 0;

    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs(radians * 180.0 / Math.PI);

    if (angle > 180.0) {
        angle = 360 - angle;
    }

    return angle;
}

export function drawSkeleton(canvasCtx: CanvasRenderingContext2D, landmarks: Point[]) {
    // Implementation for custom drawing will go here or in the component
    // Helper to draw single line
    const drawLine = (start: number, end: number, color: string = "#00F0FF", width: number = 2) => {
        if (!landmarks[start] || !landmarks[end]) return;
        if ((landmarks[start].visibility || 0) < 0.5 || (landmarks[end].visibility || 0) < 0.5) return;

        canvasCtx.beginPath();
        canvasCtx.moveTo(landmarks[start].x * canvasCtx.canvas.width, landmarks[start].y * canvasCtx.canvas.height);
        canvasCtx.lineTo(landmarks[end].x * canvasCtx.canvas.width, landmarks[end].y * canvasCtx.canvas.height);
        canvasCtx.strokeStyle = color;
        canvasCtx.lineWidth = width;
        canvasCtx.stroke();
    };

    // Draw Right Arm (Shooting Arm usually)
    drawLine(12, 14, "#00F0FF", 4); // Shoulder -> Elbow
    drawLine(14, 16, "#00F0FF", 4); // Elbow -> Wrist

    // Draw Left Arm (Guide Arm)
    drawLine(11, 13, "rgba(0, 240, 255, 0.3)", 2);
    drawLine(13, 15, "rgba(0, 240, 255, 0.3)", 2);
}
