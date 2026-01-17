import React, { useMemo } from 'react';

interface GraphProps {
    data: number[];
    max: number;
    color: string;
    label: string;
    unit: string;
}

export function SignalGraph({ data, max, color, label, unit }: GraphProps) {
    const points = useMemo(() => {
        if (data.length < 2) return "";
        const width = 100;
        const height = 40;
        const step = width / (data.length - 1);

        return data.map((val, i) => {
            const x = i * step;
            // Normalize y: 0 is bottom (height), max is top (0)
            const nVal = Math.min(Math.max(val, 0), max) / max;
            const y = height - (nVal * height);
            return `${x},${y}`;
        }).join(" ");
    }, [data, max]);

    const latest = data[data.length - 1] || 0;

    return (
        <div className="flex flex-col gap-1 w-24">
            <div className="flex justify-between items-baseline text-[9px] uppercase font-bold text-white/50 tracking-wider">
                <span>{label}</span>
                <span className="text-white/80 font-mono">{latest.toFixed(1)}{unit}</span>
            </div>

            <div className="relative h-8 w-full bg-black/30 border border-white/5 rounded overflow-hidden backdrop-blur-sm">
                {/* Grid Line */}
                <div className="absolute top-1/2 w-full h-px bg-white/5"></div>

                <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="w-full h-full">
                    <polyline
                        fill="none"
                        stroke={color}
                        strokeWidth="1.5"
                        strokeOpacity="0.7"
                        points={points}
                        vectorEffect="non-scaling-stroke"
                    />
                </svg>
            </div>
        </div>
    );
}
