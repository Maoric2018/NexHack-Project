"use client";

import React, { useState, useEffect, useRef, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { PosePipeline } from "@/components/Coach/PosePipeline";
import { ProButton, ProCard } from "@/components/UI/ProComponents";
import { ProgressRing, StreakBadge, CelebrationOverlay, SessionStatsCard } from "@/components/UI/GameComponents";
import { Play, RotateCcw, ScanLine, Activity, Loader2, Target, Zap, ChevronRight, Trophy } from "lucide-react";
import Link from 'next/link';
import { RealtimeVision } from '@overshoot/sdk';
import { DebugConsole, useDebugConsole } from "@/components/UI/DebugConsole";
import { ShotRecord, calculateGrade, generateCoachAdvice } from '@/lib/shotTypes';

// Dynamic import for 3D component (heavy)
const CourtScene = dynamic(() => import('@/components/3D/CourtScene').then(m => ({ default: m.CourtScene })), {
    ssr: false,
    loading: () => <div className="w-full h-full flex items-center justify-center bg-black/50 rounded-2xl"><Loader2 className="w-8 h-8 animate-spin text-pro-blue" /></div>
});

type ViewMode = 'LOCKER_ROOM' | 'COURT' | 'FILM_ROOM';
type Difficulty = 'EASY' | 'NORMAL' | 'PRO';

const DIFFICULTY_CONFIG = {
    EASY: { target: 5, label: 'Warm Up' },
    NORMAL: { target: 10, label: 'Standard' },
    PRO: { target: 20, label: 'Pro Drill' }
};

export default function CoachPage() {
    const [view, setView] = useState<ViewMode>('LOCKER_ROOM');
    const [difficulty, setDifficulty] = useState<Difficulty>('NORMAL');

    // Session State
    const [shots, setShots] = useState<ShotRecord[]>([]);
    const [streak, setStreak] = useState(0);
    const [bestStreak, setBestStreak] = useState(0);

    // Scan State
    const [isScanning, setIsScanning] = useState(false);
    const [scanResult, setScanResult] = useState<string | null>(null);

    // Celebration & Review
    const [showCelebration, setShowCelebration] = useState(false);
    const [sessionGrade, setSessionGrade] = useState<'S' | 'A' | 'B' | 'C'>('C');
    const [deepAnalysis, setDeepAnalysis] = useState<string | null>(null);
    const [selectedShot, setSelectedShot] = useState<ShotRecord | undefined>(undefined);
    const [isReplayPlaying, setIsReplayPlaying] = useState(false);

    const { logs, addLog } = useDebugConsole();
    const target = DIFFICULTY_CONFIG[difficulty].target;
    const angleRef = useRef(90);

    // Derived stats
    const perfectShots = shots.filter(s => s.isPerfect).length;
    const totalShots = shots.length;
    const averageAngle = totalShots > 0 ? Math.round(shots.reduce((sum, s) => sum + s.elbowAngle, 0) / totalShots) : 0;

    // Handle Shot from PosePipeline
    const handleShot = (isPerfect: boolean, elbowAngle: number, feedback: string) => {
        const newShot: ShotRecord = {
            id: shots.length + 1,
            timestamp: Date.now(),
            elbowAngle,
            isPerfect,
            feedback
        };

        setShots(prev => [...prev, newShot]);
        angleRef.current = elbowAngle;

        if (isPerfect) {
            setStreak(prev => {
                const newStreak = prev + 1;
                if (newStreak > bestStreak) setBestStreak(newStreak);
                return newStreak;
            });

            if (perfectShots + 1 >= target) {
                completeChallenge();
            }
        } else {
            setStreak(0);
        }
    };

    // Complete Challenge
    const completeChallenge = () => {
        const accuracy = (perfectShots + 1) / (totalShots + 1);
        const consistency = 1 - (bestStreak > 0 ? 0.1 : 0.3);
        const grade = calculateGrade(accuracy, averageAngle || 90, consistency);

        setSessionGrade(grade);
        setShowCelebration(true);
        addLog(`Challenge Complete! Grade: ${grade}`, 'success');
    };

    // Overshoot Scan
    const handleScan = async () => {
        setIsScanning(true);
        setScanResult(null);
        addLog("Initializing Overshoot Environment Scan...", 'info');

        try {
            const vision = new RealtimeVision({
                apiUrl: 'https://cluster1.overshoot.ai/api/v0.2',
                apiKey: process.env.NEXT_PUBLIC_OVERSHOOT_KEY || 'ovs_a09cdbe9e1d260eb0627575c4ec85a87',
                prompt: 'Describe the safety of this area for playing basketball in one short sentence.',
                source: { type: 'camera', cameraFacing: 'environment' },
                onResult: (result) => {
                    addLog("Overshoot Scan Complete.", 'success');
                    setScanResult(result.result);
                    setIsScanning(false);
                    vision.stop();
                }
            });

            addLog("Connecting to Overshoot Realtime API...", 'info');
            await vision.start();

        } catch (err) {
            addLog(`Overshoot Failed: ${err}`, 'error');
            setScanResult("Environment is clear for training.");
            setIsScanning(false);
        }
    };

    // End Session
    const handleEndSession = async () => {
        const accuracy = totalShots > 0 ? perfectShots / totalShots : 0;
        const consistency = bestStreak > 0 ? 0.8 : 0.5;
        const grade = calculateGrade(accuracy, averageAngle, consistency);

        setSessionGrade(grade);
        setView('FILM_ROOM');
        addLog("Analyzing session...", 'info');

        // Generate advice
        const summary = {
            shots, totalShots, perfectShots, averageAngle, bestStreak, grade
        };
        setDeepAnalysis(generateCoachAdvice(summary));

        // Also call API for potential future OpenAI integration
        try {
            await fetch('/api/analyze', {
                method: 'POST',
                body: JSON.stringify({ totalShots, perfectShots, averageAngle })
            });
        } catch { /* ignore */ }
    };

    // Reset Session
    const resetSession = () => {
        setShots([]);
        setStreak(0);
        setBestStreak(0);
        setScanResult(null);
        setDeepAnalysis(null);
        setSelectedShot(undefined);
        setView('LOCKER_ROOM');
    };

    useEffect(() => { addLog("System Initialized.", 'info'); }, [addLog]);

    return (
        <div className="relative w-full h-screen bg-black overflow-hidden flex flex-col font-geist-sans">
            <DebugConsole logs={logs} />

            <CelebrationOverlay
                show={showCelebration}
                grade={sessionGrade}
                onComplete={() => { setShowCelebration(false); setView('FILM_ROOM'); handleEndSession(); }}
            />

            {/* LOCKER ROOM */}
            {view === 'LOCKER_ROOM' && (
                <div className="flex-1 flex flex-col items-center justify-center p-8 relative z-10 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-gray-900 to-black">
                    <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10 pointer-events-none"></div>

                    <div className="max-w-md w-full space-y-6 animate-in fade-in slide-in-from-bottom-10 duration-700">
                        <div className="text-center space-y-2">
                            <h1 className="text-4xl font-bold tracking-tighter text-white">🏀 Form Drill</h1>
                            <p className="text-gray-400">Perfect your shooting form</p>
                        </div>

                        {/* Difficulty Selection */}
                        <ProCard className="space-y-4">
                            <div className="flex items-center gap-3">
                                <Target className="w-5 h-5 text-pro-blue" />
                                <span className="font-bold text-white">Challenge Mode</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                {(['EASY', 'NORMAL', 'PRO'] as Difficulty[]).map(d => (
                                    <button
                                        key={d}
                                        onClick={() => setDifficulty(d)}
                                        className={`py-3 rounded-xl text-sm font-bold transition-all ${difficulty === d
                                                ? 'bg-pro-blue text-white shadow-lg shadow-pro-blue/30'
                                                : 'bg-white/5 text-gray-400 hover:bg-white/10'
                                            }`}
                                    >
                                        <div>{DIFFICULTY_CONFIG[d].label}</div>
                                        <div className="text-xs opacity-60 mt-1">{DIFFICULTY_CONFIG[d].target} shots</div>
                                    </button>
                                ))}
                            </div>
                        </ProCard>

                        {/* Environment Scan */}
                        <ProCard className="space-y-4">
                            <div className="flex items-center gap-4">
                                <div className={`p-3 rounded-full ${scanResult ? 'bg-pro-green/20 text-pro-green' : 'bg-white/10 text-white'}`}>
                                    <ScanLine className="w-6 h-6" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-white">Environment Check</h3>
                                    <p className="text-xs text-gray-400">Powered by Overshoot VLM</p>
                                </div>
                            </div>

                            {scanResult ? (
                                <div className="text-sm font-medium bg-pro-green/10 p-4 rounded-lg border border-pro-green/20 text-pro-green">
                                    ✓ {scanResult}
                                </div>
                            ) : (
                                <ProButton variant="secondary" className="w-full" onClick={handleScan} isLoading={isScanning}>
                                    {isScanning ? "Scanning..." : "Scan Environment"}
                                </ProButton>
                            )}
                        </ProCard>

                        <ProButton
                            size="lg"
                            className="w-full shadow-2xl shadow-pro-blue/20"
                            onClick={() => { setView('COURT'); addLog("Entering Court...", 'info'); }}
                            disabled={!scanResult}
                        >
                            <Zap className="w-5 h-5 mr-2" /> Start Drill
                        </ProButton>

                        <Link href="/" className="block text-center text-sm text-gray-600 hover:text-white transition-colors">
                            Cancel
                        </Link>
                    </div>
                </div>
            )}

            {/* THE COURT */}
            {view === 'COURT' && (
                <div className="relative w-full h-full">
                    <PosePipeline
                        mode="TRAIN"
                        onLog={addLog}
                        onShot={(isPerfect) => handleShot(isPerfect, angleRef.current, isPerfect ? 'PERFECT' : 'NEEDS WORK')}
                    />

                    {/* Top HUD: Progress & Stats */}
                    <div className="absolute top-6 left-1/2 transform -translate-x-1/2 z-40">
                        <div className="glass-pro rounded-full px-6 py-3 flex items-center gap-6 shadow-2xl">
                            <ProgressRing current={perfectShots} total={target} size={60} />

                            <div className="flex flex-col items-center">
                                <span className="text-[10px] uppercase text-gray-400 font-bold tracking-widest">Accuracy</span>
                                <span className={`text-xl font-black ${totalShots > 0 && perfectShots / totalShots > 0.5 ? 'text-pro-green' : 'text-white'}`}>
                                    {totalShots > 0 ? Math.round((perfectShots / totalShots) * 100) : 0}%
                                </span>
                            </div>

                            <button onClick={handleEndSession} className="bg-pro-red/20 hover:bg-pro-red/30 text-pro-red rounded-full p-3 transition-colors">
                                <div className="w-4 h-4 bg-pro-red rounded-sm"></div>
                            </button>
                        </div>
                    </div>

                    {/* Streak Badge */}
                    <div className="absolute top-24 left-1/2 transform -translate-x-1/2 z-40">
                        <StreakBadge streak={streak} />
                    </div>

                    {/* Goal Indicator */}
                    <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-40">
                        <div className="glass-pro rounded-2xl px-6 py-3 text-center">
                            <span className="text-white/60 text-sm">Goal: </span>
                            <span className="text-white font-bold">{perfectShots}/{target} Perfect Shots</span>
                        </div>
                    </div>
                </div>
            )}

            {/* PREMIUM FILM ROOM */}
            {view === 'FILM_ROOM' && (
                <div className="flex-1 flex flex-col p-6 overflow-y-auto bg-gradient-to-b from-black to-gray-900">
                    <div className="max-w-6xl mx-auto w-full space-y-6 animate-in fade-in slide-in-from-bottom-10 duration-700">

                        {/* Header with Grade */}
                        <header className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className={`w-20 h-20 rounded-2xl flex items-center justify-center text-4xl font-black ${sessionGrade === 'S' ? 'bg-gradient-to-br from-yellow-400 to-orange-500' :
                                        sessionGrade === 'A' ? 'bg-gradient-to-br from-green-400 to-emerald-500' :
                                            sessionGrade === 'B' ? 'bg-gradient-to-br from-blue-400 to-cyan-500' : 'bg-gradient-to-br from-gray-400 to-slate-500'
                                    }`}>
                                    {sessionGrade}
                                </div>
                                <div>
                                    <h1 className="text-2xl font-bold text-white">Session Complete</h1>
                                    <p className="text-gray-400">Review your performance</p>
                                </div>
                            </div>
                            <Link href="/"><ProButton variant="ghost">Exit</ProButton></Link>
                        </header>

                        {/* Stats Row */}
                        <SessionStatsCard perfect={perfectShots} total={totalShots} bestStreak={bestStreak} />

                        {/* Main Content Grid */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                            {/* 3D Replay */}
                            <ProCard className="p-0 overflow-hidden aspect-video lg:aspect-auto lg:h-[400px]">
                                <div className="relative w-full h-full">
                                    <Suspense fallback={<div className="w-full h-full flex items-center justify-center"><Loader2 className="animate-spin" /></div>}>
                                        <CourtScene selectedShot={selectedShot} isPlaying={isReplayPlaying} />
                                    </Suspense>

                                    {/* Replay Controls */}
                                    <div className="absolute bottom-4 left-4 right-4 flex justify-between items-center">
                                        <span className="text-xs text-white/50 uppercase tracking-widest">3D Replay</span>
                                        <button
                                            onClick={() => setIsReplayPlaying(!isReplayPlaying)}
                                            className="bg-pro-blue/80 hover:bg-pro-blue text-white px-4 py-2 rounded-full text-sm font-bold"
                                        >
                                            {isReplayPlaying ? "Pause" : "Play Replay"}
                                        </button>
                                    </div>
                                </div>
                            </ProCard>

                            {/* Shot Breakdown */}
                            <ProCard className="space-y-4 max-h-[400px] overflow-y-auto">
                                <div className="flex items-center gap-2">
                                    <Trophy className="w-5 h-5 text-pro-blue" />
                                    <h3 className="font-bold text-white">Shot Breakdown</h3>
                                </div>

                                {shots.length === 0 ? (
                                    <p className="text-gray-500 text-sm">No shots recorded.</p>
                                ) : (
                                    <div className="space-y-2">
                                        {shots.map(shot => (
                                            <button
                                                key={shot.id}
                                                onClick={() => setSelectedShot(shot)}
                                                className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${selectedShot?.id === shot.id ? 'bg-pro-blue/20 border border-pro-blue/50' : 'bg-white/5 border border-transparent hover:bg-white/10'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${shot.isPerfect ? 'bg-pro-green/20 text-pro-green' : 'bg-pro-red/20 text-pro-red'}`}>
                                                        {shot.id}
                                                    </div>
                                                    <div className="text-left">
                                                        <div className="text-white font-medium">{shot.elbowAngle}° elbow</div>
                                                        <div className="text-xs text-gray-400">{shot.feedback}</div>
                                                    </div>
                                                </div>
                                                <ChevronRight className="w-4 h-4 text-gray-500" />
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </ProCard>
                        </div>

                        {/* Coach Notes */}
                        <ProCard className="space-y-4">
                            <div className="flex items-center gap-3">
                                <Activity className="w-5 h-5 text-pro-blue" />
                                <h3 className="font-bold text-white">Coach Notes</h3>
                            </div>
                            <p className="text-gray-300 leading-relaxed text-lg">
                                {deepAnalysis || "Analyzing your session..."}
                            </p>
                        </ProCard>

                        {/* Actions */}
                        <div className="flex gap-4">
                            <ProButton className="flex-1" onClick={resetSession}>
                                <RotateCcw className="w-4 h-4 mr-2" /> Train Again
                            </ProButton>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
