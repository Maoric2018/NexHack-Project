"use client";

import React, { useState, useEffect, useRef, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { PosePipeline } from "@/components/Coach/PosePipeline";
import { ProButton, ProCard } from "@/components/UI/ProComponents";
import { ProgressRing, StreakBadge, CelebrationOverlay } from "@/components/UI/GameComponents";
import { SplitView } from "@/components/FilmRoom/SplitView";
import { Play, RotateCcw, ScanLine, Loader2, Target, Zap } from "lucide-react";
import Link from 'next/link';
import { RealtimeVision } from '@overshoot/sdk';
import { DebugConsole, useDebugConsole } from "@/components/UI/DebugConsole";
import { ShotRecord, ShotMetrics } from '@/lib/shotTypes';
import {
    calculateTrajectory,
    calculateHarshGrade,
    standardDeviation,
    calculateReleaseAngle,
    estimateReleaseVelocity,
    PhysicsResult
} from '@/lib/physics';
import { audioCoach } from '@/lib/audioFeedback';

// Dynamic import for 3D
const CourtScene = dynamic(() => import('@/components/3D/CourtScene').then(m => ({ default: m.CourtScene })), {
    ssr: false,
    loading: () => <div className="w-full h-full flex items-center justify-center bg-black/50 rounded-xl"><Loader2 className="w-8 h-8 animate-spin text-pro-blue" /></div>
});

type ViewMode = 'LOCKER_ROOM' | 'COURT' | 'FILM_ROOM';
type Difficulty = 'EASY' | 'NORMAL' | 'PRO';

const DIFFICULTY_CONFIG = {
    EASY: { target: 5, label: 'Warm Up' },
    NORMAL: { target: 10, label: 'Standard' },
    PRO: { target: 20, label: 'Pro Drill' }
};

const GRADE_COLORS: Record<string, string> = {
    'S': 'from-yellow-400 to-orange-500',
    'A': 'from-green-400 to-emerald-500',
    'B': 'from-blue-400 to-cyan-500',
    'C': 'from-gray-400 to-slate-500',
    'D': 'from-red-400 to-rose-500',
    'F': 'from-red-600 to-red-800'
};

export default function CoachPage() {
    const [view, setView] = useState<ViewMode>('LOCKER_ROOM');
    const [difficulty, setDifficulty] = useState<Difficulty>('NORMAL');

    // Session State
    const [shots, setShots] = useState<ShotRecord[]>([]);
    const [streak, setStreak] = useState(0);
    const [bestStreak, setBestStreak] = useState(0);
    const [isScanning, setIsScanning] = useState(false);
    const [scanResult, setScanResult] = useState<string | null>(null);
    const [showCelebration, setShowCelebration] = useState(false);
    const [sessionGrade, setSessionGrade] = useState<'S' | 'A' | 'B' | 'C' | 'D' | 'F'>('C');
    const [isReplayPlaying, setIsReplayPlaying] = useState(false);
    const [physics, setPhysics] = useState<PhysicsResult | undefined>(undefined);
    const [selectedShotId, setSelectedShotId] = useState<number | null>(null);

    // Video Recording
    const [videoBlob, setVideoBlob] = useState<Blob | undefined>(undefined);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordedChunksRef = useRef<Blob[]>([]);

    const { logs, addLog } = useDebugConsole();
    const target = DIFFICULTY_CONFIG[difficulty].target;
    const angleRef = useRef(90);
    const landmarksRef = useRef<{ shoulder: { x: number; y: number }; wrist: { x: number; y: number } } | null>(null);

    // Derived stats
    const perfectShots = shots.filter(s => s.isPerfect).length;
    const totalShots = shots.length;
    const avgAngle = totalShots > 0 ? Math.round(shots.reduce((s, shot) => s + shot.elbowAngle, 0) / totalShots) : 0;
    const angleStdDev = totalShots > 0 ? standardDeviation(shots.map(s => s.elbowAngle)) : 0;

    // Handle Shot from PosePipeline - WITH PHYSICS, MOTION & METRICS
    const handleShot = (isPerfect: boolean, elbowAngle: number, feedback: string, physics?: PhysicsResult, motionData?: any[], videoTimestamp: number = 0, metrics?: ShotMetrics) => {
        const newShot: ShotRecord = {
            id: shots.length + 1,
            timestamp: Date.now(),
            elbowAngle,
            isPerfect,
            feedback,
            trajectory: physics,
            motionData: motionData,
            videoTimestamp: videoTimestamp,
            metrics: metrics
        };

        setShots(prev => [...prev, newShot]);
        angleRef.current = elbowAngle;

        // If it was the last perfect shot, we save the physics for instant replay
        if (isPerfect || physics) {
            setPhysics(physics);
        }

        if (isPerfect) {
            setStreak(prev => {
                const newStreak = prev + 1;
                if (newStreak > bestStreak) setBestStreak(newStreak);
                return newStreak;
            });
        } else {
            setStreak(0);
        }

        // NEW: End session after X TOTAL shots (not just makes)
        if (totalShots + 1 >= target) {
            completeChallenge();
        }
    };

    // Complete Challenge
    const completeChallenge = () => {
        stopRecording();
        const accuracy = (perfectShots + 1) / (totalShots + 1);
        const grade = calculateHarshGrade(accuracy, avgAngle || 90, angleStdDev);

        setSessionGrade(grade);
        setShowCelebration(true);
        addLog(`Challenge Complete! Grade: ${grade}`, 'success');
    };

    const handleScan = async () => {
        setIsScanning(true);
        setScanResult(null);
        addLog("Initializing Overshoot...", 'info');

        // Safety Timeout (5s max)
        const timeout = setTimeout(() => {
            if (!scanResult) {
                addLog("Overshoot timeout - auto-clearing", 'warning');
                setScanResult("Environment assumed safe (Timeout).");
                setIsScanning(false);
            }
        }, 5000);

        try {
            const vision = new RealtimeVision({
                apiUrl: 'https://cluster1.overshoot.ai/api/v0.2',
                apiKey: process.env.NEXT_PUBLIC_OVERSHOOT_KEY || 'ovs_a09cdbe9e1d260eb0627575c4ec85a87',
                prompt: 'Describe the safety of this area for playing basketball in one short sentence.',
                source: { type: 'camera', cameraFacing: 'environment' },
                onResult: (result) => {
                    clearTimeout(timeout);
                    setScanResult(result.result);
                    setIsScanning(false);
                    vision.stop();
                }
            });
            await vision.start();
        } catch (e) {
            clearTimeout(timeout);
            console.error("Overshoot Error:", e);
            setScanResult("Environment cleared (Offline Mode).");
            setIsScanning(false);
        }
    };

    // Video Recording
    const startRecording = (stream: MediaStream) => {
        try {
            const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
            recordedChunksRef.current = [];

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) recordedChunksRef.current.push(e.data);
            };

            recorder.onstop = () => {
                const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
                setVideoBlob(blob);
                addLog(`Recording saved: ${(blob.size / 1024 / 1024).toFixed(2)}MB`, 'success');
            };

            recorder.start(100);
            mediaRecorderRef.current = recorder;
            addLog("Recording started", 'info');
        } catch {
            addLog("Recording not supported", 'warning');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }
    };

    // End Session
    const handleEndSession = () => {
        stopRecording();

        const accuracy = totalShots > 0 ? perfectShots / totalShots : 0;
        const grade = calculateHarshGrade(accuracy, avgAngle, angleStdDev);
        setSessionGrade(grade);

        // Calculate physics for replay
        if (landmarksRef.current) {
            const releaseAngle = calculateReleaseAngle(landmarksRef.current.shoulder, landmarksRef.current.wrist);
            const releaseVelocity = estimateReleaseVelocity(avgAngle);
            const trajectory = calculateTrajectory(1.8, releaseAngle, releaseVelocity);
            setPhysics(trajectory);
        } else {
            // Default physics
            const trajectory = calculateTrajectory(1.8, 52, 8);
            setPhysics(trajectory);
        }

        setView('FILM_ROOM');
        addLog(`Session ended. Grade: ${grade}`, 'info');
    };

    // Reset
    const resetSession = () => {
        setShots([]);
        setStreak(0);
        setBestStreak(0);
        setScanResult(null);
        setVideoBlob(undefined);
        setPhysics(undefined);
        setView('LOCKER_ROOM');
    };

    useEffect(() => { addLog("System ready.", 'info'); }, [addLog]);

    return (
        <div className="relative w-full h-screen bg-black overflow-hidden flex flex-col font-mono text-white selection:bg-cyan-500/30">
            <DebugConsole logs={logs} />
            <CelebrationOverlay show={showCelebration} grade={sessionGrade as any} onComplete={() => { setShowCelebration(false); handleEndSession(); }} />

            {/* LOCKER ROOM (Calibration) */}
            {view === 'LOCKER_ROOM' && (
                <div className="flex-1 flex flex-col items-center justify-center p-8 relative z-10">
                    <div className="max-w-lg w-full space-y-12 animate-in fade-in duration-500 border-l border-r border-white/10 px-8 py-12 relative">
                        {/* Corners */}
                        <div className="absolute top-0 left-0 w-4 h-4 border-t border-l border-cyan-500" />
                        <div className="absolute top-0 right-0 w-4 h-4 border-t border-r border-cyan-500" />
                        <div className="absolute bottom-0 left-0 w-4 h-4 border-b border-l border-cyan-500" />
                        <div className="absolute bottom-0 right-0 w-4 h-4 border-b border-r border-cyan-500" />

                        <div className="text-center space-y-2">
                            <h2 className="text-xs text-cyan-500 tracking-[0.3em]">INITIALIZATION SEQUENCE</h2>
                            <h1 className="text-4xl font-light tracking-tighter">SESSION CONFIG</h1>
                        </div>

                        {/* Difficulty Select */}
                        <div className="space-y-4">
                            <div className="text-[10px] text-gray-500 uppercase tracking-widest border-b border-white/10 pb-2">Select Protocol</div>
                            <div className="grid grid-cols-3 gap-px bg-white/10">
                                {(['EASY', 'NORMAL', 'PRO'] as Difficulty[]).map(d => (
                                    <button
                                        key={d}
                                        onClick={() => setDifficulty(d)}
                                        className={`py-4 text-xs tracking-widest transition-all ${difficulty === d
                                            ? 'bg-cyan-500/10 text-cyan-400 box-shadow-[inset_0_0_20px_rgba(0,255,255,0.1)]'
                                            : 'bg-black hover:bg-white/5 text-gray-500'
                                            }`}
                                    >
                                        [{DIFFICULTY_CONFIG[d].label}]
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Env Scan */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between text-[10px] text-gray-500 uppercase tracking-widest border-b border-white/10 pb-2">
                                <span>Environment Check</span>
                                <span className={scanResult ? "text-emerald-500" : "text-yellow-500"}>{scanResult ? "CLEARED" : "PENDING"}</span>
                            </div>

                            {!scanResult ? (
                                <div className="flex gap-4">
                                    <button
                                        onClick={handleScan}
                                        disabled={isScanning}
                                        className="flex-1 py-3 border border-white/20 hover:border-cyan-500 hover:text-cyan-500 text-xs transition-colors"
                                    >
                                        {isScanning ? "SCANNING..." : "INIT_SCANNER"}
                                    </button>
                                    <button
                                        onClick={() => setScanResult("Bypassed")}
                                        className="py-3 px-6 text-xs text-gray-600 hover:text-white transition-colors"
                                    >
                                        // BYPASS
                                    </button>
                                </div>
                            ) : (
                                <div className="p-3 border border-emerald-500/30 text-emerald-500 text-xs font-mono bg-emerald-500/5">
                                    {">"} {scanResult}
                                </div>
                            )}
                        </div>

                        <button
                            onClick={() => { audioCoach.sessionStart(); setView('COURT'); }}
                            className="w-full py-4 bg-white hover:bg-cyan-400 hover:text-black text-black font-bold tracking-widest transition-colors"
                        >
                            ENGAGE SYSTEM
                        </button>
                    </div>
                </div>
            )}

            {/* COURT HUD */}
            {view === 'COURT' && (
                <div className="relative w-full h-full">
                    <PosePipeline
                        mode="TRAIN"
                        onLog={addLog}
                        onShot={(isPerfect, angle, feedback, physics, motion, ts) => handleShot(isPerfect, angle, isPerfect ? 'GOOD' : 'POOR', physics, motion, ts)}
                        onStreamReady={startRecording}
                        onLandmarksUpdate={(s, w) => { landmarksRef.current = { shoulder: s, wrist: w }; }}
                    />

                    {/* Top HUD Bar */}
                    <div className="absolute top-0 left-0 w-full p-6 flex justify-between items-start z-50 pointer-events-none">
                        <div className="flex gap-8">
                            <div>
                                <div className="text-[10px] text-gray-500">SHOT_COUNT</div>
                                <div className="text-2xl text-white">{String(totalShots + 1).padStart(2, '0')}<span className="text-gray-600">/{target}</span></div>
                            </div>
                            <div>
                                <div className="text-[10px] text-gray-500">ACCURACY</div>
                                <div className={`text-2xl ${perfectShots > 0 ? 'text-cyan-400' : 'text-white'}`}>
                                    {totalShots > 0 ? Math.round((perfectShots / totalShots) * 100) : 0}%
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-1 items-center">
                            <span className="text-[10px] text-gray-500 mr-2">STREAK</span>
                            {Array.from({ length: Math.min(5, streak) }).map((_, i) => (
                                <div key={i} className="w-1.5 h-6 bg-cyan-500 shadow-[0_0_10px_#00F0FF]" />
                            ))}
                            {streak > 5 && <span className="text-cyan-500 font-bold ml-1">+{streak - 5}</span>}
                        </div>

                        <button onClick={handleEndSession} className="pointer-events-auto border border-red-500/50 text-red-500 hover:bg-red-500 hover:text-black px-4 py-2 text-xs transition-colors">
                            TERMINATE
                        </button>
                    </div>

                    {/* Crosshairs */}
                    <div className="absolute top-6 left-6 w-4 h-4 border-t border-l border-white/30" />
                    <div className="absolute top-6 right-6 w-4 h-4 border-t border-r border-white/30" />
                    <div className="absolute bottom-6 left-6 w-4 h-4 border-b border-l border-white/30" />
                    <div className="absolute bottom-6 right-6 w-4 h-4 border-b border-r border-white/30" />
                </div>
            )}

            {/* FILM ROOM (Analysis) */}
            {view === 'FILM_ROOM' && (
                <div className="flex-1 flex flex-col p-8 overflow-y-auto bg-black border-t-2 border-cyan-500/20">
                    <header className="flex justify-between items-end mb-12 border-b border-white/10 pb-6">
                        <div>
                            <div className="text-[10px] text-cyan-500 mb-2">SESSION_ID: {Date.now().toString().slice(-6)}</div>
                            <h1 className="text-5xl font-light text-white">ANALYSIS REPORT</h1>
                        </div>
                        <div className="text-right space-y-1">
                            <div className="text-2xl font-bold text-white">{sessionGrade} GRADE</div>
                            <div className="text-xs text-gray-500">PERFORMANCE INDEX</div>
                        </div>
                    </header>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                        {/* Data Column */}
                        <div className="lg:col-span-1 space-y-12">
                            {/* Summary Stats */}
                            <div className="grid grid-cols-2 gap-8">
                                <div>
                                    <div className="text-4xl font-light text-white">{totalShots > 0 ? Math.round((perfectShots / totalShots) * 100) : 0}%</div>
                                    <div className="text-[10px] text-gray-500 mt-1 uppercase">Accuracy</div>
                                </div>
                                <div>
                                    <div className="text-4xl font-light text-cyan-400">{avgAngle}°</div>
                                    <div className="text-[10px] text-gray-500 mt-1 uppercase">Avg. Release</div>
                                </div>
                                <div>
                                    <div className="text-4xl font-light text-purple-400">{bestStreak}</div>
                                    <div className="text-[10px] text-gray-500 mt-1 uppercase">Max Streak</div>
                                </div>
                                <div>
                                    <div className="text-4xl font-light text-white">±{angleStdDev.toFixed(1)}°</div>
                                    <div className="text-[10px] text-gray-500 mt-1 uppercase">Variance</div>
                                </div>
                            </div>

                            {/* Shot List */}
                            <div className="border-t border-white/10 pt-6">
                                <h3 className="text-xs text-gray-500 uppercase mb-4">Sequence Log</h3>
                                <div className="h-64 overflow-y-auto space-y-px bg-white/5">
                                    {shots.map((shot, idx) => (
                                        <button
                                            key={shot.id}
                                            onClick={() => setSelectedShotId(shot.id)}
                                            className={`w-full flex justify-between px-4 py-3 text-xs hover:bg-white/10 transition-colors ${selectedShotId === shot.id ? 'bg-cyan-500/20 text-cyan-400' : 'text-gray-400'}`}
                                        >
                                            <span>{String(idx + 1).padStart(2, '0')}</span>
                                            <span className={shot.isPerfect ? "text-cyan-400" : "text-white/30"}>{shot.isPerfect ? "SWISH" : "MISS"}</span>
                                            <span className="font-mono">{Math.round(shot.elbowAngle)}°</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Visual Column */}
                        <div className="lg:col-span-2 flex flex-col gap-6">
                            <div className="h-[500px] border border-white/10 bg-black relative">
                                {/* Corners */}
                                <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-white/50" />
                                <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-white/50" />
                                <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-white/50" />
                                <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-white/50" />

                                <Suspense fallback={<div className="p-8 text-xs text-gray-500">LOADING_VISUALIZER...</div>}>
                                    <SplitView
                                        videoBlob={videoBlob}
                                        onPlayStateChange={setIsReplayPlaying}
                                        clipRange={selectedShotId ? {
                                            start: Math.max(0, (shots.find(s => s.id === selectedShotId)?.videoTimestamp || 0) - 1.5),
                                            end: (shots.find(s => s.id === selectedShotId)?.videoTimestamp || 0) + 1.0
                                        } : null}
                                    >
                                        <CourtScene
                                            physics={selectedShotId ? shots.find(s => s.id === selectedShotId)?.trajectory : physics}
                                            motionData={selectedShotId ? shots.find(s => s.id === selectedShotId)?.motionData : undefined}
                                            isPlaying={isReplayPlaying}
                                        />
                                    </SplitView>
                                </Suspense>
                            </div>

                            <div className="flex justify-between items-center text-[10px] text-gray-600 uppercase">
                                <div>Interactive 3D Replay Module</div>
                                <button onClick={resetSession} className="text-white hover:text-cyan-400 flex items-center gap-2">
                                    <RotateCcw className="w-3 h-3" /> Reset System
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
