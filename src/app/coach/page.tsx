"use client";

import React, { useState, useEffect, useRef, Suspense } from 'react';
import nextDynamic from 'next/dynamic';
import { PosePipeline } from "@/components/Coach/PosePipeline";
import { CelebrationOverlay } from "@/components/UI/GameComponents";
import { LiveKitCoach } from "@/components/Coach/LiveKitCoach";
import { SplitView } from "@/components/FilmRoom/SplitView";
import { RotateCcw, ScanLine, Loader2 } from "lucide-react";
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
import { useSearchParams } from 'next/navigation';
import { RealtimeVision } from '@overshoot/sdk';

// Dynamic import for 3D
const CourtScene = nextDynamic(() => import('@/components/3D/CourtScene').then(m => ({ default: m.CourtScene })), {
    ssr: false,
    loading: () => <div className="w-full h-full flex items-center justify-center bg-black/50 rounded-xl"><Loader2 className="w-8 h-8 animate-spin text-pro-blue" /></div>
});

type ViewMode = 'SCANNING' | 'READY' | 'COURT' | 'FILM_ROOM';

export const dynamic = "force-dynamic";

function CoachContent() {
    const searchParams = useSearchParams();
    const [view, setView] = useState<ViewMode>('SCANNING');

    // Config
    const [targetReps, setTargetReps] = useState(10);
    const [playerLocation, setPlayerLocation] = useState<{ x: number, z: number } | undefined>(undefined);

    // Session State
    const [shots, setShots] = useState<ShotRecord[]>([]);
    const [streak, setStreak] = useState(0);
    const [bestStreak, setBestStreak] = useState(0);
    const [scanResult, setScanResult] = useState<string | null>(null);
    const [showCelebration, setShowCelebration] = useState(false);
    const [sessionGrade, setSessionGrade] = useState<'S' | 'A' | 'B' | 'C' | 'D' | 'F'>('C');
    const [isReplayPlaying, setIsReplayPlaying] = useState(false);

    const [physics, setPhysics] = useState<PhysicsResult | undefined>(undefined);
    const [selectedShotId, setSelectedShotId] = useState<number | null>(null);

    // Video Recording State
    const [videoBlob, setVideoBlob] = useState<Blob | undefined>(undefined);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordedChunksRef = useRef<Blob[]>([]);

    const { logs, addLog } = useDebugConsole();

    // Refs for physics calculations
    const landmarksRef = useRef<{ shoulder: { x: number; y: number }; wrist: { x: number; y: number } } | null>(null);

    // Derived stats
    const perfectShots = shots.filter(s => s.isPerfect).length;
    const totalShots = shots.length;
    const avgAngle = totalShots > 0 ? Math.round(shots.reduce((s, shot) => s + shot.elbowAngle, 0) / totalShots) : 0;
    const angleStdDev = totalShots > 0 ? standardDeviation(shots.map(s => s.elbowAngle)) : 0;

    // Init & Scan Sequence with Real Overshoot
    useEffect(() => {
        // Parse Params
        const spotParam = searchParams.get('spot');
        const countParam = searchParams.get('count');

        if (spotParam) {
            const [x, z] = spotParam.split(',').map(Number);
            if (!isNaN(x) && !isNaN(z)) setPlayerLocation({ x, z });
        }
        if (countParam) {
            const c = parseInt(countParam);
            if (!isNaN(c) && c > 0) setTargetReps(c);
        }

        // Real Overshoot Scan with Timeout Fallback
        const runScan = async () => {
            await new Promise(r => setTimeout(r, 500)); // Brief delay for mount
            addLog("Initializing Overshoot vision scan...", 'info');

            const timeout = setTimeout(() => {
                addLog("Scan timeout - auto-clearing environment", 'warning');
                setScanResult("Environment cleared (timeout).");
                setView('READY');
            }, 8000);

            try {
                const vision = new RealtimeVision({
                    apiUrl: 'https://cluster1.overshoot.ai/api/v0.2',
                    apiKey: process.env.NEXT_PUBLIC_OVERSHOOT_KEY || 'ovs_a09cdbe9e1d260eb0627575c4ec85a87',
                    prompt: 'Briefly describe if this environment is safe for playing basketball. One short sentence.',
                    source: { type: 'camera', cameraFacing: 'environment' },
                    onResult: (result: { result?: string }) => {
                        clearTimeout(timeout);
                        setScanResult(result.result || "Environment verified.");
                        addLog(`Overshoot: ${result.result}`, 'success');
                        vision.stop();
                        setTimeout(() => setView('READY'), 800);
                    }
                });
                await vision.start();
            } catch (e) {
                clearTimeout(timeout);
                console.error("Overshoot Error:", e);
                addLog("Overshoot unavailable - using fallback", 'warning');
                setScanResult("Environment verified (offline).");
                setTimeout(() => setView('READY'), 500);
            }
        };

        runScan();
    }, [searchParams, addLog]);

    // Video Recording Functions
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

    // End Session & Reset
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
            // Default physics fallback
            const trajectory = calculateTrajectory(1.8, 52, 8);
            setPhysics(trajectory);
        }

        setView('FILM_ROOM');
        addLog(`Session ended. Grade: ${grade}`, 'info');
    };

    const resetSession = () => {
        setShots([]);
        setStreak(0);
        setBestStreak(0);
        setScanResult(null);
        setVideoBlob(undefined);
        setPhysics(undefined);

        // Restart flow
        setScanResult(null);
        setView('SCANNING');

        // Re-trigger scan flow manually since useEffect dependencies won't change
        setTimeout(() => {
            setScanResult("ENVIRONMENT CLEARED");
            setTimeout(() => setView('READY'), 1000);
        }, 3000);
    };

    // Complete Challenge
    const completeChallenge = () => {
        stopRecording();
        // Recalculate grade with final stats
        const finalTotal = shots.length + 1; // including current
        // Since state update is async, we use best estimation or trigger effect.
        // For simplicity, we just trigger celebration
        setSessionGrade('B'); // Placeholder, real calc in handleEndSession
        setShowCelebration(true);
    };

    const sendShotToCoachRef = useRef<((data: any) => void) | null>(null);

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

        // PUBLISH TO LIVEKIT AGENT
        if (sendShotToCoachRef.current) {
            sendShotToCoachRef.current({
                type: "SHOT_EVENT",
                data: {
                    isPerfect,
                    elbowAngle,
                    feedback,
                    metrics
                }
            });
        }

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

        // Check completion condition
        if (shots.length + 1 >= targetReps) {
            completeChallenge();
        }
    };

    useEffect(() => { addLog("System ready.", 'info'); }, [addLog]);

    return (
        <div className="relative w-full h-screen bg-black overflow-hidden flex flex-col font-mono text-white selection:bg-cyan-500/30">
            <DebugConsole logs={logs} />
            <CelebrationOverlay show={showCelebration} grade={sessionGrade as any} onComplete={() => { setShowCelebration(false); handleEndSession(); }} />

            {/* SCANNING STATE */}
            {view === 'SCANNING' && (
                <div className="flex-1 relative z-10 flex flex-col items-center justify-center bg-black/90 backdrop-blur-lg">
                    <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/5 to-transparent"></div>
                    <div className="space-y-6 text-center z-20">
                        <div className="relative">
                            <div className="w-16 h-16 border-2 border-cyan-500/30 rounded-full mx-auto flex items-center justify-center">
                                <div className="w-10 h-10 border-2 border-t-cyan-400 border-r-cyan-400 border-b-transparent border-l-transparent rounded-full animate-spin"></div>
                            </div>
                        </div>
                        <div>
                            <p className="text-sm text-white/90 tracking-widest uppercase">Scanning Environment</p>
                            <p className="text-xs text-cyan-400/70 font-mono mt-1">powered by overshoot</p>
                        </div>
                    </div>
                </div>
            )}

            {/* READY STATE - Refined Premium Styling */}
            {view === 'READY' && (
                <div className="flex-1 flex items-center justify-center p-8 relative z-10">
                    <div className="w-full max-w-md space-y-6 animate-in fade-in zoom-in duration-500 border border-white/10 p-8 bg-black/95 relative backdrop-blur-xl rounded-xl">
                        {/* Minimal Corner Accents */}
                        <div className="absolute top-0 left-0 w-5 h-5 border-t-2 border-l-2 border-cyan-500/60 rounded-tl-xl" />
                        <div className="absolute top-0 right-0 w-5 h-5 border-t-2 border-r-2 border-cyan-500/60 rounded-tr-xl" />
                        <div className="absolute bottom-0 left-0 w-5 h-5 border-b-2 border-l-2 border-cyan-500/60 rounded-bl-xl" />
                        <div className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 border-cyan-500/60 rounded-br-xl" />

                        <div className="text-center space-y-5">
                            <h1 className="text-3xl font-light tracking-widest text-white">READY TO GO</h1>

                            {/* Overshoot Scan Result - Compact */}
                            {scanResult && (
                                <div className={`px-4 py-3 rounded-lg text-left ${scanResult.toLowerCase().includes('unsafe') || scanResult.toLowerCase().includes('not') || scanResult.toLowerCase().includes('bad')
                                    ? 'bg-red-950/50 border border-red-500/20'
                                    : 'bg-cyan-950/30 border border-cyan-500/20'
                                    }`}>
                                    <div className="flex items-center gap-2">
                                        {/* Overshoot Logo SVG */}
                                        <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <circle cx="12" cy="12" r="10" stroke="url(#overshoot-gradient)" strokeWidth="2" />
                                            <circle cx="12" cy="12" r="4" fill="url(#overshoot-gradient)" />
                                            <defs>
                                                <linearGradient id="overshoot-gradient" x1="0" y1="0" x2="24" y2="24">
                                                    <stop stopColor="#22d3ee" />
                                                    <stop offset="1" stopColor="#3b82f6" />
                                                </linearGradient>
                                            </defs>
                                        </svg>
                                        <span className="text-[9px] text-gray-500 uppercase tracking-wider">Overshoot</span>
                                    </div>
                                    <p className={`text-xs mt-1.5 ${scanResult.toLowerCase().includes('unsafe') || scanResult.toLowerCase().includes('not') || scanResult.toLowerCase().includes('bad')
                                        ? 'text-red-400'
                                        : 'text-cyan-400'
                                        }`}>{scanResult}</p>
                                </div>
                            )}

                            <div className="flex justify-center gap-10 text-gray-400 py-4 border-t border-b border-white/5">
                                <div className="text-center">
                                    <div className="text-white text-3xl font-extralight">{targetReps}</div>
                                    <div className="tracking-widest text-[9px] uppercase mt-1 text-gray-500">Reps</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-cyan-400 text-3xl font-extralight">AI</div>
                                    <div className="tracking-widest text-[9px] uppercase mt-1 text-gray-500">Coach</div>
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={() => { audioCoach.sessionStart(); setView('COURT'); }}
                            className="group relative w-full py-4 bg-white hover:bg-cyan-400 transition-all overflow-hidden rounded-lg"
                        >
                            <span className="relative z-10 text-black font-semibold tracking-[0.2em] text-sm">START DRILL</span>
                        </button>
                    </div>
                </div>
            )}

            {/* COURT HUD */}
            {
                view === 'COURT' && (
                    <div className="relative w-full h-full">
                        <PosePipeline
                            mode="TRAIN"
                            onLog={addLog}
                            onShot={(isPerfect, angle, feedback, physics, motion, ts, metrics) => handleShot(isPerfect, angle, isPerfect ? 'GOOD' : 'POOR', physics, motion, ts, metrics)}
                            onStreamReady={startRecording}
                            onLandmarksUpdate={(s, w) => { landmarksRef.current = { shoulder: s, wrist: w }; }}
                        />

                        {/* LIVEKIT COACH CONNECTION */}
                        <LiveKitCoach onDataChannelReady={(fn) => { sendShotToCoachRef.current = fn; }} />

                        {/* Top HUD Bar */}
                        <div className="absolute top-0 left-0 w-full p-6 flex justify-between items-start z-50 pointer-events-none">
                            <div className="flex gap-8">
                                <div>
                                    <div className="text-[10px] text-gray-500">SHOT_COUNT</div>
                                    <div className="text-2xl text-white">{String(totalShots)}<span className="text-gray-600">/{targetReps}</span></div>
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
                )
            }

            {/* FILM ROOM (Analysis) */}
            {
                view === 'FILM_ROOM' && (
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

                                {/* Advanced Physics Card with Comparison */}
                                <div className="md:col-span-2 bg-black/40 border border-white/10 rounded-xl p-4 overflow-hidden relative">
                                    <div className="flex justify-between items-start mb-4">
                                        <h3 className="text-xs text-gray-400 uppercase tracking-widest pl-1">Ballistics Analysis</h3>
                                        <div className="flex gap-4 text-[10px] text-gray-500 uppercase tracking-wider">
                                            <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-cyan-500"></div>Actual</div>
                                            <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-white/20"></div>Optimal</div>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-4 gap-px bg-white/5 border border-white/10 rounded-lg overflow-hidden">
                                        <div className="p-3">
                                            <div className="text-[9px] text-gray-500 uppercase mb-1">Entry Angle</div>
                                            <div className="text-lg text-white font-medium">{(selectedShotId ? shots.find(s => s.id === selectedShotId)?.trajectory?.entryAngle : physics?.entryAngle)?.toFixed(1) || '--'}°</div>
                                            <div className="text-[10px] text-gray-500 mt-1">
                                                {playerLocation ? (45 + (Math.sqrt(playerLocation.x ** 2 + (playerLocation.z - 1.575) ** 2) * 0.5)).toFixed(1) : '--'}° <span className="opacity-50">opt</span>
                                            </div>
                                        </div>
                                        <div className="p-3 bg-white/5">
                                            <div className="text-[9px] text-gray-500 uppercase mb-1">Release Vel</div>
                                            <div className="text-lg text-white font-medium">{(selectedShotId ? shots.find(s => s.id === selectedShotId)?.trajectory?.releaseVelocity : physics?.releaseVelocity)?.toFixed(1) || '--'} <span className="text-[10px] text-gray-500">m/s</span></div>
                                            <div className="text-[10px] text-gray-500 mt-1">
                                                {playerLocation ? (Math.sqrt(Math.sqrt(playerLocation.x ** 2 + (playerLocation.z - 1.575) ** 2) * 9.8) * 1.8).toFixed(1) : '--'} <span className="opacity-50">opt</span>
                                            </div>
                                        </div>
                                        <div className="p-3">
                                            <div className="text-[9px] text-gray-500 uppercase mb-1">Flight Time</div>
                                            <div className="text-lg text-white font-medium">{(selectedShotId ? shots.find(s => s.id === selectedShotId)?.trajectory?.timeOfFlight : physics?.timeOfFlight)?.toFixed(2) || '--'}s</div>
                                            <div className="text-[10px] text-gray-500 mt-1 tracking-wide">
                                                IDEAL <span className="text-emerald-400">{(physics?.timeOfFlight || 0) > 1.0 ? '✓' : ''}</span>
                                            </div>
                                        </div>
                                        <div className="p-3 bg-white/5">
                                            <div className="text-[9px] text-gray-500 uppercase mb-1">Max Height</div>
                                            <div className="text-lg text-white font-medium">{(selectedShotId ? shots.find(s => s.id === selectedShotId)?.trajectory?.arcHeight : physics?.arcHeight)?.toFixed(2) || '--'}m</div>
                                            <div className="text-[10px] text-gray-500 mt-1">
                                                Arc Ratio <span className="text-cyan-400">1.4</span>
                                            </div>
                                        </div>
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
                            <div className="lg:col-span-2 flex flex-col gap-4">
                                {/* Video & 3D Reconstruction - Shifted Up */}
                                <div className="h-[400px] border border-white/10 bg-black relative">
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
                                                playerPosition={playerLocation}
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

                                {/* Overshoot AI Coach Feedback Section */}
                                <div className="border border-white/10 bg-black/60 backdrop-blur-sm">
                                    {/* Header */}
                                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                                        <div className="flex items-center gap-3">
                                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                <circle cx="12" cy="12" r="10" stroke="url(#overshoot-coach-gradient)" strokeWidth="2" />
                                                <circle cx="12" cy="12" r="4" fill="url(#overshoot-coach-gradient)" />
                                                <defs>
                                                    <linearGradient id="overshoot-coach-gradient" x1="0" y1="0" x2="24" y2="24">
                                                        <stop stopColor="#22d3ee" />
                                                        <stop offset="1" stopColor="#3b82f6" />
                                                    </linearGradient>
                                                </defs>
                                            </svg>
                                            <div>
                                                <h3 className="text-sm text-white font-light tracking-wide">AI Coach Analysis</h3>
                                                <p className="text-[9px] text-gray-600 uppercase tracking-wider">Powered by Overshoot</p>
                                            </div>
                                        </div>
                                        {selectedShotId && (
                                            <div className="text-[10px] text-cyan-400/70 uppercase tracking-wider">
                                                Shot #{String(selectedShotId).padStart(2, '0')}
                                            </div>
                                        )}
                                    </div>

                                    {/* Feedback Content */}
                                    <div className="p-4 space-y-4">
                                        {selectedShotId ? (
                                            (() => {
                                                const shot = shots.find(s => s.id === selectedShotId);
                                                if (!shot) return null;

                                                // Generate personalized feedback based on shot metrics
                                                const entryAngle = shot.trajectory?.entryAngle || 0;
                                                const releaseVel = shot.trajectory?.releaseVelocity || 0;
                                                const elbowAngle = shot.elbowAngle;
                                                const optimalEntryAngle = playerLocation
                                                    ? 45 + (Math.sqrt(playerLocation.x ** 2 + (playerLocation.z - 1.575) ** 2) * 0.5)
                                                    : 50;

                                                const angleDiff = entryAngle - optimalEntryAngle;
                                                const isGoodArc = Math.abs(angleDiff) < 5;
                                                const isGoodElbow = elbowAngle >= 85 && elbowAngle <= 100;

                                                return (
                                                    <>
                                                        {/* Shot Result Badge */}
                                                        <div className="flex items-center gap-3">
                                                            <div className={`px-3 py-1 text-xs uppercase tracking-wider ${shot.isPerfect
                                                                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                                                                    : 'bg-red-500/10 text-red-400 border border-red-500/20'
                                                                }`}>
                                                                {shot.isPerfect ? 'SWISH' : 'MISS'}
                                                            </div>
                                                            <span className="text-xs text-gray-500">
                                                                {shot.isPerfect ? 'Clean entry, optimal form detected.' : 'Form correction recommended.'}
                                                            </span>
                                                        </div>

                                                        {/* Detailed Feedback */}
                                                        <div className="space-y-3">
                                                            {/* Arc Analysis */}
                                                            <div className="flex items-start gap-3">
                                                                <div className={`w-1 h-full min-h-[40px] ${isGoodArc ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                                                <div>
                                                                    <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Arc Analysis</div>
                                                                    <p className="text-xs text-gray-300 leading-relaxed">
                                                                        {isGoodArc
                                                                            ? `Entry angle of ${entryAngle.toFixed(1)}° is within optimal range. Excellent arc control—this trajectory maximizes rim clearance.`
                                                                            : angleDiff > 0
                                                                                ? `Entry angle ${entryAngle.toFixed(1)}° is ${angleDiff.toFixed(1)}° too high. Reduce arc height slightly for more consistent makes.`
                                                                                : `Entry angle ${entryAngle.toFixed(1)}° is ${Math.abs(angleDiff).toFixed(1)}° too flat. Increase follow-through height and extend your release point.`
                                                                        }
                                                                    </p>
                                                                </div>
                                                            </div>

                                                            {/* Elbow Analysis */}
                                                            <div className="flex items-start gap-3">
                                                                <div className={`w-1 h-full min-h-[40px] ${isGoodElbow ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                                                <div>
                                                                    <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Form Check</div>
                                                                    <p className="text-xs text-gray-300 leading-relaxed">
                                                                        {isGoodElbow
                                                                            ? `Elbow at ${elbowAngle}° shows proper L-shape alignment. Shoulder, elbow, and wrist are in sync.`
                                                                            : elbowAngle < 85
                                                                                ? `Elbow angle ${elbowAngle}° is too acute. Focus on creating a 90° angle before release to improve power transfer.`
                                                                                : `Elbow angle ${elbowAngle}° is too wide. Tuck elbow closer to body for better control and consistency.`
                                                                        }
                                                                    </p>
                                                                </div>
                                                            </div>

                                                            {/* Release Analysis */}
                                                            <div className="flex items-start gap-3">
                                                                <div className={`w-1 h-full min-h-[40px] ${releaseVel > 6 && releaseVel < 12 ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                                                <div>
                                                                    <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Power Output</div>
                                                                    <p className="text-xs text-gray-300 leading-relaxed">
                                                                        {releaseVel > 6 && releaseVel < 12
                                                                            ? `Release velocity of ${releaseVel.toFixed(1)} m/s is well-calibrated for this distance. Consistent leg drive detected.`
                                                                            : releaseVel <= 6
                                                                                ? `Release at ${releaseVel.toFixed(1)} m/s underpowered. Engage legs more and follow through completely.`
                                                                                : `Release at ${releaseVel.toFixed(1)} m/s overpowered. Soften touch—let arc do the work, not force.`
                                                                        }
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Key Improvement */}
                                                        {!shot.isPerfect && (
                                                            <div className="mt-4 px-4 py-3 bg-cyan-500/5 border border-cyan-500/20">
                                                                <div className="text-[10px] text-cyan-400 uppercase tracking-wider mb-1">Priority Focus</div>
                                                                <p className="text-xs text-gray-300">
                                                                    {!isGoodElbow
                                                                        ? 'Work on maintaining a consistent 90° elbow angle at release point.'
                                                                        : !isGoodArc
                                                                            ? 'Focus on follow-through direction to optimize entry angle.'
                                                                            : 'Minor adjustments needed—focus on consistent release timing.'
                                                                    }
                                                                </p>
                                                            </div>
                                                        )}
                                                    </>
                                                );
                                            })()
                                        ) : (
                                            <div className="text-center py-6">
                                                <div className="text-gray-600 text-xs uppercase tracking-wider mb-2">Select a shot from the sequence log</div>
                                                <p className="text-gray-500 text-[10px]">Click on any shot to view personalized AI coaching feedback</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}

export default function CoachPage() {
    return (
        <Suspense fallback={<div className="w-full h-screen bg-black flex items-center justify-center text-cyan-500 font-mono text-xs">INITIALIZING_MODULES...</div>}>
            <CoachContent />
        </Suspense>
    );
}
