"use client";

import React, { useEffect, useState, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Flame, Trophy, Sparkles } from 'lucide-react';

// Progress Ring Component
interface ProgressRingProps {
    current: number;
    total: number;
    size?: number;
    className?: string;
}

export function ProgressRing({ current, total, size = 120, className }: ProgressRingProps) {
    const progress = Math.min(current / total, 1);
    const strokeWidth = 8;
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const offset = circumference - progress * circumference;

    return (
        <div className={cn("relative flex items-center justify-center", className)} style={{ width: size, height: size }}>
            <svg width={size} height={size} className="transform -rotate-90">
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="transparent"
                    stroke="rgba(255,255,255,0.1)"
                    strokeWidth={strokeWidth}
                />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="transparent"
                    stroke="url(#progressGradient)"
                    strokeWidth={strokeWidth}
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    className="transition-all duration-500 ease-out"
                />
                <defs>
                    <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#00E676" />
                        <stop offset="100%" stopColor="#2997FF" />
                    </linearGradient>
                </defs>
            </svg>
            <div className="absolute flex flex-col items-center">
                <span className="text-3xl font-black text-white">{current}</span>
                <span className="text-xs text-white/50 font-medium">/ {total}</span>
            </div>
        </div>
    );
}

// Streak Badge Component
interface StreakBadgeProps {
    streak: number;
    className?: string;
}

export function StreakBadge({ streak, className }: StreakBadgeProps) {
    const isHot = streak >= 3;
    const isOnFire = streak >= 5;

    if (streak < 2) return null;

    return (
        <div className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-full backdrop-blur-md border transition-all duration-300",
            isOnFire
                ? "bg-orange-500/30 border-orange-400/50 text-orange-200 animate-pulse"
                : isHot
                    ? "bg-yellow-500/20 border-yellow-400/30 text-yellow-200"
                    : "bg-white/10 border-white/20 text-white",
            className
        )}>
            <Flame className={cn("w-5 h-5", isOnFire && "animate-bounce")} />
            <span className="font-bold tracking-wide">{streak} STREAK</span>
            {isOnFire && <Sparkles className="w-4 h-4" />}
        </div>
    );
}

// Celebration Overlay - FIXED: proper effect cleanup and guards
interface CelebrationOverlayProps {
    show: boolean;
    grade: 'S' | 'A' | 'B' | 'C' | 'D' | 'F';
    onComplete?: () => void;
}

export function CelebrationOverlay({ show, grade, onComplete }: CelebrationOverlayProps) {
    const [visible, setVisible] = useState(false);
    const hasTriggeredRef = useRef(false);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        // Only trigger once when show becomes true
        if (show && !hasTriggeredRef.current) {
            hasTriggeredRef.current = true;
            // Defer state update to next tick to avoid synchronous render warning
            setTimeout(() => setVisible(true), 0);

            timerRef.current = setTimeout(() => {
                setVisible(false);
                onComplete?.();
            }, 3000);
        }

        // Reset when show becomes false
        if (!show) {
            hasTriggeredRef.current = false;
        }

        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }
        };
    }, [show]); // Removed onComplete from deps to prevent re-triggers

    if (!visible) return null;

    const gradeColors: Record<string, string> = {
        'S': 'from-yellow-400 to-orange-500',
        'A': 'from-green-400 to-emerald-500',
        'B': 'from-blue-400 to-cyan-500',
        'C': 'from-gray-400 to-slate-500',
        'D': 'from-orange-800 to-red-600',
        'F': 'from-red-600 to-red-900',
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in zoom-in duration-500">
            <div className="text-center space-y-6">
                <div className="flex justify-center">
                    <Trophy className="w-20 h-20 text-yellow-400 animate-bounce" />
                </div>
                <h1 className="text-5xl font-black text-white tracking-tight">CHALLENGE COMPLETE!</h1>
                <div className={cn(
                    "inline-block text-9xl font-black bg-gradient-to-r bg-clip-text text-transparent",
                    gradeColors[grade]
                )}>
                    {grade}
                </div>
                <div className="space-y-1">
                    <p className="text-2xl font-bold text-white tracking-wide">
                        {(() => {
                            switch (grade) {
                                case 'S': return 'ELITE MARKSMAN';
                                case 'A': return 'PROFESSIONAL';
                                case 'B': return 'COLLEGIATE';
                                case 'C': return 'DEVELOPMENTAL';
                                case 'D': return 'NOVICE';
                                case 'F': return 'NEEDS WORK';
                                default: return 'UNRATED';
                            }
                        })()}
                    </p>
                    <p className="text-sm text-white/50 uppercase tracking-widest">Session Grade</p>
                </div>
            </div>
        </div>
    );
}

// Session Stats Card
interface SessionStatsProps {
    perfect: number;
    total: number;
    bestStreak: number;
    className?: string;
}

export function SessionStatsCard({ perfect, total, bestStreak, className }: SessionStatsProps) {
    const accuracy = total > 0 ? Math.round((perfect / total) * 100) : 0;

    return (
        <div className={cn("grid grid-cols-3 gap-4", className)}>
            <div className="bg-white/5 rounded-2xl p-4 text-center border border-white/10">
                <div className="text-3xl font-black text-white">{accuracy}%</div>
                <div className="text-xs text-white/50 uppercase tracking-widest mt-1">Accuracy</div>
            </div>
            <div className="bg-white/5 rounded-2xl p-4 text-center border border-white/10">
                <div className="text-3xl font-black text-pro-green">{perfect}</div>
                <div className="text-xs text-white/50 uppercase tracking-widest mt-1">Perfect</div>
            </div>
            <div className="bg-white/5 rounded-2xl p-4 text-center border border-white/10">
                <div className="text-3xl font-black text-orange-400">{bestStreak}</div>
                <div className="text-xs text-white/50 uppercase tracking-widest mt-1">Best Streak</div>
            </div>
        </div>
    );
}
