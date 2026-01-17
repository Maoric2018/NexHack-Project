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
import { ShotRecord } from '@/lib/shotTypes';
import {
    calculateTrajectory,
    calculateHarshGrade,
    standardDeviation,
    calculateReleaseAngle,
    estimateReleaseVelocity,
    PhysicsResult
} from '@/lib/physics';

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

    // Handle Shot from PosePipeline - NOW WITH PHYSICS
    const handleShot = (isPerfect: boolean, elbowAngle: number, feedback: string, physics?: PhysicsResult) => {
        const newShot: ShotRecord = {
            id: shots.length + 1,
            timestamp: Date.now(),
            elbowAngle,
            isPerfect,
            feedback,
            trajectory: physics // Store physics for 3D replay
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

            if (perfectShots + 1 >= target) {
                completeChallenge();
            }
        } else {
            setStreak(0);
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

    // Overshoot Scan
    const handleScan = async () => {
        setIsScanning(true);
        setScanResult(null);
        addLog("Initializing Overshoot...", 'info');

        try {
            const vision = new RealtimeVision({
                apiUrl: 'https://cluster1.overshoot.ai/api/v0.2',
                apiKey: process.env.NEXT_PUBLIC_OVERSHOOT_KEY || 'ovs_a09cdbe9e1d260eb0627575c4ec85a87',
                prompt: 'Describe the safety of this area for playing basketball in one short sentence.',
                source: { type: 'camera', cameraFacing: 'environment' },
                onResult: (result) => {
                    setScanResult(result.result);
                    setIsScanning(false);
                    vision.stop();
                }
            });
            await vision.start();
        } catch {
            setScanResult("Environment cleared for training.");
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
        <div className="relative w-full h-screen bg-black overflow-hidden flex flex-col font-geist-sans">
            <DebugConsole logs={logs} />

            <CelebrationOverlay
                show={showCelebration}
                grade={sessionGrade as 'S' | 'A' | 'B' | 'C'}
                onComplete={() => { setShowCelebration(false); handleEndSession(); }}
            />

            {/* LOCKER ROOM */}
            {view === 'LOCKER_ROOM' && (
                <div className="flex-1 flex flex-col items-center justify-center p-8 relative z-10 bg-gradient-to-b from-gray-900 to-black">
                    <div className="max-w-md w-full space-y-6 animate-in fade-in duration-500">
                        <div className="text-center space-y-2">
                            <h1 className="text-4xl font-bold tracking-tight text-white">Form Drill</h1>
                            <p className="text-gray-500">Biomechanics analysis system</p>
                        </div>

                        {/* Difficulty */}
                        <ProCard className="space-y-4">
                            <div className="flex items-center gap-3">
                                <Target className="w-5 h-5 text-pro-blue" />
                                <span className="font-bold text-white">Difficulty</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                {(['EASY', 'NORMAL', 'PRO'] as Difficulty[]).map(d => (
                                    <button
                                        key={d}
                                        onClick={() => setDifficulty(d)}
                                        className={`py-3 rounded-xl text-sm font-bold transition-all ${difficulty === d
                                            ? 'bg-pro-blue text-white'
                                            : 'bg-white/5 text-gray-400 hover:bg-white/10'
                                            }`}
                                    >
                                        <div>{DIFFICULTY_CONFIG[d].label}</div>
                                        <div className="text-xs opacity-60 mt-1">{DIFFICULTY_CONFIG[d].target} shots</div>
                                    </button>
                                ))}
                            </div>
                        </ProCard>

                        {/* Scan */}
                        <ProCard className="space-y-4">
                            <div className="flex items-center gap-4">
                                <ScanLine className={`w-6 h-6 ${scanResult ? 'text-pro-green' : 'text-white'}`} />
                                <div>
                                    <h3 className="font-bold text-white">Environment</h3>
                                    <p className="text-xs text-gray-500">Overshoot VLM</p>
                                </div>
                            </div>
                            {scanResult ? (
                                <div className="text-sm bg-pro-green/10 p-3 rounded-lg border border-pro-green/20 text-pro-green">✓ {scanResult}</div>
                            ) : (
                                <div className="flex gap-2">
                                    <ProButton variant="secondary" className="flex-1" onClick={handleScan} isLoading={isScanning}>
                                        {isScanning ? "Scanning..." : "Scan"}
                                    </ProButton>
                                    <ProButton
                                        variant="ghost"
                                        className="text-gray-400"
                                        onClick={() => setScanResult("Skipped - proceed with caution")}
                                    >
                                        Skip
                                    </ProButton>
                                </div>
                            )}
                        </ProCard>

                        <ProButton size="lg" className="w-full" onClick={() => setView('COURT')}>
                            <Zap className="w-5 h-5 mr-2" /> Start
                        </ProButton>

                        <Link href="/" className="block text-center text-sm text-gray-600 hover:text-white">Cancel</Link>
                    </div>
                </div>
            )}

            {/* COURT */}
            {view === 'COURT' && (
                <div className="relative w-full h-full">
                    <PosePipeline
                        mode="TRAIN"
                        onLog={addLog}
                        onShot={(isPerfect) => handleShot(isPerfect, angleRef.current, isPerfect ? 'GOOD' : 'POOR')}
                        onStreamReady={startRecording}
                        onLandmarksUpdate={(shoulder, wrist) => { landmarksRef.current = { shoulder, wrist }; }}
                    />

                    {/* HUD */}
                    <div className="absolute top-6 left-1/2 transform -translate-x-1/2 z-40">
                        <div className="glass-pro rounded-full px-6 py-3 flex items-center gap-6">
                            <ProgressRing current={perfectShots} total={target} size={60} />
                            <div className="text-center">
                                <div className="text-[10px] text-gray-400 uppercase tracking-widest">Accuracy</div>
                                <div className={`text-xl font-black ${totalShots > 0 && perfectShots / totalShots > 0.5 ? 'text-pro-green' : 'text-white'}`}>
                                    {totalShots > 0 ? Math.round((perfectShots / totalShots) * 100) : 0}%
                                </div>
                            </div>
                            <button onClick={handleEndSession} className="bg-pro-red/20 hover:bg-pro-red/30 text-pro-red rounded-full p-3">
                                <div className="w-4 h-4 bg-pro-red rounded-sm" />
                            </button>
                        </div>
                    </div>

                    <div className="absolute top-24 left-1/2 transform -translate-x-1/2 z-40">
                        <StreakBadge streak={streak} />
                    </div>

                    <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-40">
                        <div className="glass-pro rounded-2xl px-6 py-3 text-center">
                            <span className="text-white/60 text-sm">Goal: </span>
                            <span className="text-white font-bold">{perfectShots}/{target}</span>
                        </div>
                    </div>
                </div>
            )}

            {/* FILM ROOM */}
            {view === 'FILM_ROOM' && (
                <div className="flex-1 flex flex-col p-6 overflow-y-auto bg-gradient-to-b from-black to-gray-900">
                    <div className="max-w-5xl mx-auto w-full space-y-6 animate-in fade-in duration-500">

                        {/* Header */}
                        <header className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className={`w-20 h-20 rounded-2xl flex items-center justify-center text-4xl font-black bg-gradient-to-br ${GRADE_COLORS[sessionGrade]}`}>
                                    {sessionGrade}
                                </div>
                                <div>
                                    <h1 className="text-2xl font-bold text-white">Analysis Complete</h1>
                                    <p className="text-gray-500 font-mono text-sm">
                                        {perfectShots}/{totalShots} perfect • σ={angleStdDev.toFixed(1)}° • μ={avgAngle}°
                                    </p>
                                </div>
                            </div>
                            <Link href="/"><ProButton variant="ghost">Exit</ProButton></Link>
                        </header>

                        {/* Stats Grid */}
                        <div className="grid grid-cols-4 gap-4">
                            <div className="bg-white/5 rounded-xl p-4 border border-white/10 text-center">
                                <div className="text-2xl font-black text-white">{totalShots > 0 ? Math.round((perfectShots / totalShots) * 100) : 0}%</div>
                                <div className="text-xs text-gray-500 uppercase tracking-widest">Accuracy</div>
                            </div>
                            <div className="bg-white/5 rounded-xl p-4 border border-white/10 text-center">
                                <div className="text-2xl font-black text-pro-green">{avgAngle}°</div>
                                <div className="text-xs text-gray-500 uppercase tracking-widest">Avg Elbow</div>
                            </div>
                            <div className="bg-white/5 rounded-xl p-4 border border-white/10 text-center">
                                <div className="text-2xl font-black text-orange-400">{bestStreak}</div>
                                <div className="text-xs text-gray-500 uppercase tracking-widest">Best Streak</div>
                            </div>
                            <div className="bg-white/5 rounded-xl p-4 border border-white/10 text-center">
                                <div className="text-2xl font-black text-pro-blue">±{angleStdDev.toFixed(1)}°</div>
                                <div className="text-xs text-gray-500 uppercase tracking-widest">Consistency</div>
                            </div>
                        </div>

                        {/* Split View */}
                        <Suspense fallback={<div className="h-[400px] flex items-center justify-center"><Loader2 className="animate-spin" /></div>}>
                            <SplitView videoBlob={videoBlob} onPlayStateChange={setIsReplayPlaying}>
                                <CourtScene physics={physics} isPlaying={isReplayPlaying} />
                            </SplitView>
                        </Suspense>

                        {/* Physics Info */}
                        {physics && (
                            <ProCard className="grid grid-cols-4 gap-4 text-center">
                                <div>
                                    <div className="text-2xl font-mono text-pro-green">{physics.releaseAngle}°</div>
                                    <div className="text-xs text-gray-500">Release Angle</div>
                                </div>
                                <div>
                                    <div className="text-2xl font-mono text-pro-blue">{physics.releaseVelocity.toFixed(1)} m/s</div>
                                    <div className="text-xs text-gray-500">Release Velocity</div>
                                </div>
                                <div>
                                    <div className="text-2xl font-mono text-orange-400">{physics.arcHeight.toFixed(2)}m</div>
                                    <div className="text-xs text-gray-500">Arc Height</div>
                                </div>
                                <div>
                                    <div className="text-2xl font-mono text-white">{physics.timeOfFlight.toFixed(2)}s</div>
                                    <div className="text-xs text-gray-500">Flight Time</div>
                                </div>
                            </ProCard>
                        )}

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
