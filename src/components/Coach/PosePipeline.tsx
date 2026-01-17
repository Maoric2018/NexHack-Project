"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import Script from "next/script";
import { LiveKitFeed } from "@/components/Coach/LiveKitFeed";
import { drawSkeleton } from "@/lib/poseUtils";
import { useShotAnalysis } from "@/hooks/useShotAnalysis";
import { ProCard, ProBadge } from "@/components/UI/ProComponents";
import { Activity } from "lucide-react";

interface MPResults {
    poseLandmarks: { x: number; y: number; z: number; visibility: number }[];
    poseWorldLandmarks?: { x: number; y: number; z: number; visibility: number }[];
}

interface PosePipelineProps {
    mode: 'SCAN' | 'TRAIN';
    onShot?: (isPerfect: boolean) => void;
    onLog?: (msg: string, level: 'info' | 'success' | 'warning' | 'error') => void;
}

export function PosePipeline({ mode, onShot, onLog }: PosePipelineProps) {
    const [scriptLoaded, setScriptLoaded] = useState(false);
    const [videoReady, setVideoReady] = useState(false);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const requestRef = useRef<number>(0);
    const poseRef = useRef<any>(null);
    const loopStartedRef = useRef(false);

    const { analyzeFrame, angle, state, feedback, isPerfect, status, guidance } = useShotAnalysis();
    const prevState = useRef(state);

    // Stable Log Reference
    const onLogRef = useRef(onLog);
    useEffect(() => { onLogRef.current = onLog; }, [onLog]);

    const log = useCallback((msg: string, level: 'info' | 'success' | 'warning' | 'error' = 'info') => {
        console.log(`[Pipeline] ${msg}`);
        if (onLogRef.current) onLogRef.current(msg, level);
    }, []);

    // Shot Event Listener
    useEffect(() => {
        if (onShot && prevState.current !== 'RELEASE' && state === 'RELEASE') {
            onShot(isPerfect);
            log(`Shot Detected: ${isPerfect ? 'Perfect' : 'Flaw'}`, isPerfect ? 'success' : 'warning');
        }
        prevState.current = state;
    }, [state, isPerfect, onShot, log]);

    // MediaPipe Results Handler
    const onResults = useCallback((results: MPResults) => {
        console.log("[MediaPipe] onResults - Landmarks:", results.poseLandmarks?.length || 0);

        if (!results.poseLandmarks) return;

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);

        const points = results.poseLandmarks.map(l => ({ x: l.x, y: l.y, visibility: l.visibility }));
        drawSkeleton(ctx, points);
        analyzeFrame(points);

        ctx.restore();
    }, [analyzeFrame]);

    // Tracking Loop
    const startLoop = useCallback(() => {
        if (loopStartedRef.current) {
            console.log("[Loop] Already started, skipping");
            return;
        }
        loopStartedRef.current = true;
        log("Starting tracking loop...", 'info');

        const loop = async () => {
            const video = videoRef.current;
            const pose = poseRef.current;

            if (!video || video.paused || video.ended || !pose) {
                requestRef.current = requestAnimationFrame(loop);
                return;
            }

            if (video.readyState >= 2 && video.videoWidth > 0) {
                const canvas = canvasRef.current;
                if (canvas && canvas.width !== video.videoWidth) {
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    console.log("[Loop] Canvas synced:", video.videoWidth, "x", video.videoHeight);
                }

                try {
                    await pose.send({ image: video });
                } catch (e) {
                    console.error("[Loop] send failed:", e);
                }
            }

            requestRef.current = requestAnimationFrame(loop);
        };

        loop();
    }, [log]);

    // Initialize MediaPipe when script loads
    useEffect(() => {
        if (!scriptLoaded || typeof window === 'undefined' || !(window as any).Pose) return;

        log("Initializing MediaPipe...", 'info');
        const Pose = (window as any).Pose;
        const pose = new Pose({
            locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
        });

        pose.setOptions({
            modelComplexity: 1,
            smoothLandmarks: true,
            enableSegmentation: false,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
        });

        pose.onResults(onResults);
        poseRef.current = pose;
        log("MediaPipe initialized.", 'success');

        return () => {
            pose.close();
            poseRef.current = null;
        };
    }, [scriptLoaded, onResults, log]);

    // Start loop when BOTH video AND pose are ready
    useEffect(() => {
        console.log("[Sync] videoReady:", videoReady, "poseRef:", !!poseRef.current);
        if (videoReady && poseRef.current) {
            startLoop();
        }
    }, [videoReady, scriptLoaded, startLoop]);

    // Cleanup
    useEffect(() => {
        return () => {
            cancelAnimationFrame(requestRef.current);
            loopStartedRef.current = false;
        };
    }, []);

    const isSearching = status === 'SEARCHING';
    const isLocked = status === 'LOCKED';

    return (
        <div className="relative w-full h-full font-geist-sans">
            <Script
                src="https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js"
                strategy="afterInteractive"
                onLoad={() => {
                    console.log("[Script] MediaPipe downloaded");
                    setScriptLoaded(true);
                    log("MediaPipe Script Downloaded", 'success');
                }}
                onError={() => log("Failed to load MediaPipe script", 'error')}
            />

            <LiveKitFeed onVideoReady={(v) => {
                console.log("[Feed] Video ready callback");
                videoRef.current = v;
                setVideoReady(true);
                log("LiveKit Video Ready", 'success');
            }} />

            <canvas
                ref={canvasRef}
                className="absolute top-0 left-0 w-full h-full object-cover pointer-events-none opacity-80"
            />

            {/* PREMIUM AR OVERLAY */}
            {mode === 'TRAIN' && (
                <>
                    {/* Status & Guidance (Centered below top HUD) */}
                    {isSearching && guidance && (
                        <div className="absolute top-32 left-1/2 transform -translate-x-1/2 z-30">
                            <div className="bg-black/60 backdrop-blur-md px-6 py-3 rounded-full border border-white/10">
                                <span className="text-white font-medium">{guidance}</span>
                            </div>
                        </div>
                    )}

                    {/* 2. Main HUD (Bottom Right) */}
                    <div className="absolute bottom-8 right-8 z-30 pointer-events-none">
                        <div className="relative group">
                            {/* Glow Effect */}
                            <div className={`absolute -inset-1 blur-xl opacity-20 transition-all duration-500 ${isPerfect ? 'bg-pro-green' : 'bg-pro-blue'}`}></div>

                            <div className="relative backdrop-blur-2xl bg-black/60 border border-white/10 p-6 rounded-[2rem] min-w-[240px] shadow-2xl">
                                <div className="flex justify-between items-start mb-2">
                                    <span className="text-[10px] uppercase text-white/40 font-bold tracking-widest">Elbow Angle</span>
                                    <Activity className="w-4 h-4 text-white/40" />
                                </div>

                                <div className="flex items-baseline gap-1">
                                    <span className={`text-7xl font-black tracking-tighter tabular-nums transition-colors duration-200 ${isSearching ? 'text-white/20' : 'text-white'}`}>
                                        {angle}
                                    </span>
                                    <span className="text-xl text-white/40 font-light">°</span>
                                </div>

                                <div className="h-1.5 w-full bg-white/10 rounded-full mt-4 overflow-hidden">
                                    <div
                                        className={`h-full transition-all duration-300 ease-out ${isPerfect ? 'bg-pro-green shadow-[0_0_10px_#00E676]' : 'bg-pro-blue'}`}
                                        style={{ width: `${Math.min((angle / 180) * 100, 100)}%` }}
                                    ></div>
                                </div>

                                <div className="mt-4 flex items-center justify-between">
                                    <span className={`text-sm font-bold tracking-wide uppercase ${isPerfect ? 'text-pro-green' : 'text-white/80'}`}>
                                        {feedback}
                                    </span>
                                    {isPerfect && <div className="w-2 h-2 bg-pro-green rounded-full shadow-[0_0_8px_#00E676]"></div>}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 3. Guide Lines (Optional AR Elements) */}
                    <div className="absolute inset-0 pointer-events-none pb-20 opacity-20">
                        <div className="w-full h-full border-[20px] border-white/5 rounded-[3rem]"></div>
                    </div>
                </>
            )}
        </div>
    );
}
