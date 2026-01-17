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

                        <ProButton size="lg" className="w-full" onClick={() => {
                            audioCoach.sessionStart();
                            setView('COURT');
                        }}>
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
                        onShot={(isPerfect, angle, feedback, physics, motion, ts) => handleShot(isPerfect, angle, isPerfect ? 'GOOD' : 'POOR', physics, motion, ts)}
                        onStreamReady={startRecording}
                        onLandmarksUpdate={(shoulder, wrist) => { landmarksRef.current = { shoulder, wrist }; }}
                    />

                    {/* HUD */}
                    <div className="absolute top-6 left-1/2 transform -translate-x-1/2 z-40">
                        <div className="glass-pro rounded-full px-6 py-3 flex items-center gap-6">
                            {/* Shot Counter (Primary) */}
                            <div className="text-center">
                                <div className="text-3xl font-black text-white">
                                    {totalShots + 1}<span className="text-lg text-gray-400">/{target}</span>
                                </div>
                                <div className="text-[10px] text-gray-400 uppercase tracking-widest">Shot</div>
                            </div>

                            {/* Divider */}
                            <div className="w-px h-10 bg-white/20" />

                            {/* Makes/Accuracy */}
                            <div className="text-center">
                                <div className={`text-xl font-black ${perfectShots > 0 ? 'text-pro-green' : 'text-gray-400'}`}>
                                    {perfectShots}<span className="text-sm text-gray-400"> made</span>
                                </div>
                                <div className="text-[10px] text-gray-400 uppercase tracking-widest">
                                    {totalShots > 0 ? Math.round((perfectShots / totalShots) * 100) : 0}% accuracy
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

                        {/* Split Master/Detail View */}
                        <div className="grid grid-cols-3 gap-6 h-[600px]">

                            {/* LEFT: SHOT TAPE (Playlist) */}
                            <div className="col-span-1 bg-white/5 rounded-2xl border border-white/10 overflow-hidden flex flex-col">
                                <div className="p-4 border-b border-white/10 bg-white/5">
                                    <h3 className="font-bold text-white flex items-center gap-2">
                                        <Play className="w-4 h-4 text-pro-blue" /> Shot Tape
                                    </h3>
                                </div>
                                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                                    {shots.map((shot, idx) => (
                                        <button
                                            key={shot.id}
                                            onClick={() => setSelectedShotId(shot.id)}
                                            className={`w-full text-left p-3 rounded-xl transition-all flex items-center justify-between group border ${selectedShotId === shot.id
                                                ? 'bg-pro-blue/20 border-pro-blue text-white shadow-lg shadow-pro-blue/20'
                                                : shot.isPerfect
                                                    ? 'bg-pro-green/5 border-pro-green/30 text-pro-green hover:bg-pro-green/10'
                                                    : 'bg-red-500/5 border-red-500/20 text-red-400 hover:bg-red-500/10'
                                                }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${shot.isPerfect
                                                    ? 'bg-pro-green text-black shadow-[0_0_12px_rgba(0,230,118,0.5)]'
                                                    : 'bg-red-500/30 text-red-300'
                                                    }`}>
                                                    {shot.isPerfect ? '✓' : '✗'}
                                                </div>
                                                <div>
                                                    <div className={`text-sm font-bold ${shot.isPerfect ? 'text-pro-green' : 'text-red-400'}`}>
                                                        {shot.isPerfect ? '🟢 SWISH' : '🔴 MISS'}
                                                    </div>
                                                    <div className="text-[10px] opacity-60 font-mono text-gray-400">
                                                        Shot #{idx + 1} • {Math.round(shot.elbowAngle)}°
                                                    </div>
                                                </div>
                                            </div>
                                            {selectedShotId === shot.id && <Play className="w-4 h-4 fill-current text-pro-blue" />}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* RIGHT: PLAYER (Video + 3D) */}
                            <div className="col-span-2 flex flex-col gap-4">
                                <Suspense fallback={<div className="h-[400px] flex items-center justify-center"><Loader2 className="animate-spin" /></div>}>
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

                                {/* COMPREHENSIVE SHOT ANALYTICS */}
                                {selectedShotId && (() => {
                                    const shot = shots.find(s => s.id === selectedShotId);
                                    const p = shot?.trajectory;
                                    const m = shot?.metrics;
                                    if (!shot) return null;

                                    return (
                                        <div className="space-y-3">
                                            {/* Physics Row */}
                                            <ProCard className="p-4">
                                                <div className="text-[10px] text-gray-500 uppercase mb-3 flex items-center gap-2">
                                                    <span className="w-2 h-2 rounded-full bg-pro-blue animate-pulse" />
                                                    BALLISTIC TRAJECTORY
                                                </div>
                                                <div className="grid grid-cols-4 gap-4 text-center">
                                                    <div>
                                                        <div className="text-2xl font-mono text-pro-green">{p ? Math.round(p.releaseAngle) : '--'}°</div>
                                                        <div className="text-[10px] text-gray-500">RELEASE ANGLE</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-2xl font-mono text-pro-blue">{p ? (p.releaseVelocity).toFixed(1) : '--'}</div>
                                                        <div className="text-[10px] text-gray-500">VELOCITY (m/s)</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-2xl font-mono text-orange-400">{p ? p.arcHeight.toFixed(2) : '--'}</div>
                                                        <div className="text-[10px] text-gray-500">ARC HEIGHT (m)</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-2xl font-mono text-white">{p ? p.timeOfFlight.toFixed(2) : '--'}</div>
                                                        <div className="text-[10px] text-gray-500">FLIGHT TIME (s)</div>
                                                    </div>
                                                </div>
                                            </ProCard>

                                            {/* Biomechanics Row */}
                                            {m && (
                                                <ProCard className="p-4">
                                                    <div className="text-[10px] text-gray-500 uppercase mb-3 flex items-center gap-2">
                                                        <span className="w-2 h-2 rounded-full bg-pro-green animate-pulse" />
                                                        BIOMECHANICS
                                                    </div>
                                                    <div className="grid grid-cols-5 gap-3 text-center">
                                                        <div>
                                                            <div className="text-lg font-mono text-cyan-400">{m.setAngle}°</div>
                                                            <div className="text-[9px] text-gray-500">SET ANGLE</div>
                                                        </div>
                                                        <div>
                                                            <div className="text-lg font-mono text-cyan-400">{m.releaseAngle}°</div>
                                                            <div className="text-[9px] text-gray-500">RELEASE ANGLE</div>
                                                        </div>
                                                        <div>
                                                            <div className="text-lg font-mono text-yellow-400">{m.armExtensionSpeed}</div>
                                                            <div className="text-[9px] text-gray-500">SPEED (°/s)</div>
                                                        </div>
                                                        <div>
                                                            <div className="text-lg font-mono text-pink-400">{m.verticalLift.toFixed(1)}%</div>
                                                            <div className="text-[9px] text-gray-500">VERTICAL LIFT</div>
                                                        </div>
                                                        <div>
                                                            <div className="text-lg font-mono text-purple-400">{m.releaseTime}ms</div>
                                                            <div className="text-[9px] text-gray-500">RELEASE TIME</div>
                                                        </div>
                                                    </div>
                                                </ProCard>
                                            )}

                                            {/* Form Score Bar */}
                                            {m && (
                                                <ProCard className="p-4">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className="text-[10px] text-gray-500 uppercase">FORM QUALITY SCORE</span>
                                                        <span className={`text-xl font-black ${m.formScore >= 70 ? 'text-pro-green' : m.formScore >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                                                            {m.formScore}/100
                                                        </span>
                                                    </div>
                                                    <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
                                                        <div
                                                            className={`h-full transition-all duration-500 ${m.formScore >= 70 ? 'bg-gradient-to-r from-pro-green to-emerald-400' :
                                                                m.formScore >= 40 ? 'bg-gradient-to-r from-yellow-500 to-orange-400' :
                                                                    'bg-gradient-to-r from-red-500 to-pink-400'
                                                                }`}
                                                            style={{ width: `${m.formScore}%` }}
                                                        />
                                                    </div>
                                                    <div className="mt-2 text-[10px] text-gray-400">
                                                        {m.formScore >= 70 ? '✅ Excellent form - NBA-level mechanics' :
                                                            m.formScore >= 40 ? '⚠️ Decent form - work on follow-through' :
                                                                '❌ Poor form - slow down and focus on fundamentals'}
                                                    </div>
                                                </ProCard>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>

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
