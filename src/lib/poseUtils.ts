// Removed unused import

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

export function drawSkeleton(ctx: CanvasRenderingContext2D, landmarks: Point[]) {
    // Cyberpunk/Pro Connectors
    const connect = (a: number, b: number, color: string = "rgba(0, 240, 255, 0.4)", width: number = 2) => {
        const p1 = landmarks[a];
        const p2 = landmarks[b];
        if (!p1 || !p2 || (p1.visibility || 0) < 0.4 || (p2.visibility || 0) < 0.4) return;

        ctx.beginPath();
        ctx.moveTo(p1.x * ctx.canvas.width, p1.y * ctx.canvas.height);
        ctx.lineTo(p2.x * ctx.canvas.width, p2.y * ctx.canvas.height);
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = "round";
        ctx.shadowBlur = 8;
        ctx.shadowColor = color;
        ctx.stroke();
        ctx.shadowBlur = 0; // Reset
    };

    const drawNode = (i: number, color: string = "#fff", size: number = 3) => {
        const p = landmarks[i];
        if (!p || (p.visibility || 0) < 0.4) return;

        const cx = p.x * ctx.canvas.width;
        const cy = p.y * ctx.canvas.height;

        ctx.beginPath();
        ctx.arc(cx, cy, size, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();
        // Glow ring
        ctx.beginPath();
        ctx.arc(cx, cy, size * 2, 0, 2 * Math.PI);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
        ctx.lineWidth = 1;
        ctx.stroke();
    };

    // Body (Torso)
    connect(11, 12, "rgba(255, 255, 255, 0.3)", 3); // Shoulder
    connect(23, 24, "rgba(255, 255, 255, 0.3)", 3); // Hip
    connect(11, 23, "rgba(255, 255, 255, 0.2)", 1); // L Torso
    connect(12, 24, "rgba(255, 255, 255, 0.2)", 1); // R Torso

    // Arms
    connect(12, 14, "#00F0FF", 4); // R Upper
    connect(14, 16, "#00F0FF", 4); // R Forearm
    connect(11, 13, "rgba(0, 240, 255, 0.3)", 2); // L Upper
    connect(13, 15, "rgba(0, 240, 255, 0.3)", 2); // L Forearm

    // Legs
    connect(24, 26, "rgba(255, 255, 255, 0.2)", 2); // R Thigh
    connect(26, 28, "rgba(255, 255, 255, 0.2)", 2); // R Shin
    connect(23, 25, "rgba(255, 255, 255, 0.2)", 2); // L Thigh
    connect(25, 27, "rgba(255, 255, 255, 0.2)", 2); // L Shin

    // Nodes (Joints)
    [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28].forEach(i => drawNode(i, i % 2 === 0 ? "#00F0FF" : "white"));
}
