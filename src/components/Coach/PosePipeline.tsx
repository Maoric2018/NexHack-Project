"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { LiveKitFeed } from "@/components/Coach/LiveKitFeed";
import { drawSkeleton } from "@/lib/poseUtils";
import { useShotAnalysis } from "@/hooks/useShotAnalysis";
import { ProCard, ProBadge } from "@/components/UI/ProComponents";
import { Activity } from "lucide-react";
import { moveNet, mapMoveNetToMediaPipe } from "@/lib/detector";
import { PhysicsResult } from "@/lib/physics";
import { SignalGraph } from "@/components/UI/ScientificGraphs";

interface PosePipelineProps {
    mode: 'SCAN' | 'TRAIN';
    onShot?: (isPerfect: boolean, elbowAngle: number, feedback: string, physics?: PhysicsResult, motionData?: any[], timestamp?: number) => void;
    onLog?: (msg: string, level: 'info' | 'success' | 'warning' | 'error') => void;
    onStreamReady?: (stream: MediaStream) => void;
    onLandmarksUpdate?: (shoulder: { x: number; y: number }, wrist: { x: number; y: number }) => void;
}

export function PosePipeline({ mode, onShot, onLog, onStreamReady, onLandmarksUpdate }: PosePipelineProps) {
    const [videoReady, setVideoReady] = useState(false);

    // UI Update State (throttled)
    const [displayAngle, setDisplayAngle] = useState(0);
    const [displayFeedback, setDisplayFeedback] = useState("");
    const [displayStatus, setDisplayStatus] = useState("SEARCHING");
    const [displayGuidance, setDisplayGuidance] = useState("");

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const requestRef = useRef<number>(0);
    const lastShotMotionRef = useRef<any[] | null>(null);

    const { analyzeFrame, angle, state, feedback, isPerfect, status, guidance, lastPhysics, metrics } = useShotAnalysis();

    // Stable Log Reference
    const onLogRef = useRef(onLog);
    useEffect(() => { onLogRef.current = onLog; }, [onLog]);

    const log = useCallback((msg: string, level: 'info' | 'success' | 'warning' | 'error' = 'info') => {
        console.log(`[Pipeline] ${msg}`);
        if (onLogRef.current) onLogRef.current(msg, level);
    }, []);

    // Sync UI with hook state (Throttled update separate from tracking loop)
    useEffect(() => {
        setDisplayAngle(angle);
        setDisplayFeedback(feedback);
        setDisplayStatus(status);
        setDisplayGuidance(guidance);
    }, [angle, feedback, status, guidance]);

    // Shot Event Listener - FIXED: Prevent multiple fires per shot
    const lastShotStateRef = useRef<string>('');
    useEffect(() => {
        // Only fire once per RELEASE state transition
        if (onShot && state === 'RELEASE' && lastShotStateRef.current !== 'RELEASE') {
            lastShotStateRef.current = 'RELEASE';
            lastShotStateRef.current = 'RELEASE';

            // Calculate relative timestamp (video time)
            const timestamp = videoRef.current ? videoRef.current.currentTime : 0;

            if (onShot) {
                // Pass motion data (landmarks history)
                // We cast physics to include motionData which is a slight hack but efficient
                // Actually, let's just piggyback on physics or add a new arg? 
                // The interface expects (isPerfect, angle, feedback, physics).
                // Let's attach motionData to physics object for transport if needed, OR update the prop signature.
                // Updating prop signature in next step. For now, assuming prop update.
                onShot(isPerfect, angle, feedback, lastPhysics, lastShotMotionRef.current || [], timestamp);
            }

            if (lastPhysics) {
                log(`Physics: ${lastPhysics.releaseVelocity.toFixed(1)}m/s @ ${lastPhysics.releaseAngle}°`, 'success');
            }
            log(`Shot Detected: ${isPerfect ? 'Perfect' : 'Flaw'}`, isPerfect ? 'success' : 'warning');
        }
        // Reset when state leaves RELEASE (back to IDLE or SET)
        if (state !== 'RELEASE') {
            lastShotStateRef.current = state;
        }
    }, [state, isPerfect, onShot, log, lastPhysics, angle, feedback]);

    // Initialize Detector
    useEffect(() => {
        moveNet.initialize().then(() => log("MoveNet Ready", 'success'));
    }, [log]);

    // Helper: Pass landmarks for physics if available
    const updatePhysicsLandmarks = (landmarks: any[]) => {
        if (!onLandmarksUpdate) return;
        // Check standard BP indices (12/16 right, 11/15 left)
        const getPt = (idx: number) => landmarks[idx] && landmarks[idx].visibility > 0.3 ? landmarks[idx] : null;

        let shoulder = getPt(12);
        let wrist = getPt(16);

        // Fallback to left
        if (!shoulder || !wrist) {
            shoulder = getPt(11);
            wrist = getPt(15);
        }

        if (shoulder && wrist) {
            onLandmarksUpdate(
                { x: shoulder.x, y: shoulder.y },
                { x: wrist.x, y: wrist.y }
            );
        }
    };

    // Main Loop
    const loop = async () => {
        if (!videoRef.current || !canvasRef.current || !videoReady) {
            requestRef.current = requestAnimationFrame(loop);
            return;
        }

        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        if (video.videoWidth === 0 || video.videoHeight === 0) {
            requestRef.current = requestAnimationFrame(loop);
            return;
        }

        // 1. Resize Canvas
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
        }

        // 2. Estimate Pose
        const pose = await moveNet.estimatePoses(video);

        // 3. Process Pose
        if (pose && pose.keypoints) {
            // Map to BP format for analysis
            const landmarks = mapMoveNetToMediaPipe(pose.keypoints, video.videoWidth, video.videoHeight);

            // Run Analysis
            // Run Analysis
            // Note: analyzeFrame now returns an object if a shot was detected
            const result = analyzeFrame(landmarks);

            // If shot detected, store motion data temporarily so effect can pick it up
            if (result && result.shotMotion) {
                lastShotMotionRef.current = result.shotMotion;
            }

            updatePhysicsLandmarks(landmarks);

            // Draw
            if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                // Mirror mapping for drawing
                ctx.save();
                ctx.scale(-1, 1);
                ctx.translate(-canvas.width, 0);
                drawSkeleton(ctx, landmarks); // Removed width/height args as drawSkeleton might not take them OR I should check the def
                ctx.restore();
            }
        } else if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }

        requestRef.current = requestAnimationFrame(loop);
    };

    // Start Loop when video ready
    useEffect(() => {
        if (videoReady) {
            requestRef.current = requestAnimationFrame(loop);
        }
        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [videoReady, analyzeFrame]);

    // Metrics History for Graphs
    const [velHistory, setVelHistory] = useState<number[]>(new Array(20).fill(0));
    const [accHistory, setAccHistory] = useState<number[]>(new Array(20).fill(0));

    // Update Graphs
    useEffect(() => {
        if (!metrics) return;
        setVelHistory(prev => [...prev.slice(1), metrics.velocity * 10]); // Scale to approx m/s
        setAccHistory(prev => [...prev.slice(1), Math.abs(metrics.acceleration * 10)]);
    }, [metrics]);

    return (
        <div className="relative w-full h-full bg-black rounded-xl overflow-hidden shadow-2xl border border-white/10">
            <LiveKitFeed
                onVideoReady={(v) => {
                    log("Camera Connected", 'success');
                    videoRef.current = v;
                    setVideoReady(true);
                }}
                onStreamReady={onStreamReady}
            />

            <canvas
                ref={canvasRef}
                className="absolute top-0 left-0 w-full h-full object-cover pointer-events-none opacity-80"
            />

            {/* PREMIUM AR OVERLAY */}
            {mode === 'TRAIN' && (
                <>
                    {/* Status & Guidance */}
                    <div className="absolute top-24 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 w-full max-w-sm px-4">
                        {status === 'SEARCHING' ? (
                            <ProCard className="bg-black/60 backdrop-blur-md border-white/10 py-2 px-4 animate-pulse">
                                <div className="flex items-center gap-2 text-yellow-400">
                                    <Activity className="w-4 h-4" />
                                    <span className="font-bold">LOOKING FOR PLAYER</span>
                                </div>
                            </ProCard>
                        ) : (

                            <div className="flex flex-col items-center gap-4 animate-in slide-in-from-top-4 fade-in duration-300">
                                {/* Dynamic Status Bar */}
                                <div className="flex items-center gap-3 px-4 py-2 bg-black/40 backdrop-blur-xl border border-white/10 rounded-full shadow-2xl">
                                    <div className="w-2 h-2 rounded-full bg-pro-green animate-pulse" />
                                    <span className="text-xs font-bold text-white tracking-widest uppercase">
                                        SYSTEM LOCKED
                                    </span>
                                    <div className="w-px h-3 bg-white/20" />
                                    <span className="text-xs font-mono text-pro-green">
                                        {((metrics?.velocity || 0) * 10).toFixed(1)} m/s
                                    </span>
                                </div>

                                {/* Main HUD - Circular Layout Idea (Simplified for CSS) */}
                                <div className="relative flex flex-col items-center justify-center">
                                    {/* Angle Readout */}
                                    <div className="flex items-start gap-1">
                                        <span className={`text-7xl font-black tracking-tighter ${angle >= 85 && angle <= 95 ? 'text-pro-green drop-shadow-[0_0_20px_rgba(0,230,118,0.5)]' : 'text-white'
                                            }`}>
                                            {angle}
                                        </span>
                                        <span className="text-lg font-bold text-white/40 mt-2">°</span>
                                    </div>
                                    <span className="text-[10px] font-bold text-white/30 tracking-[0.2em] uppercase">Elbow Flexion</span>

                                    {/* Minimalist Bar below */}
                                    <div className="mt-4 w-32 h-1 bg-white/10 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full transition-all duration-300 ${angle >= 85 && angle <= 95 ? 'bg-pro-green' : 'bg-white'
                                                }`}
                                            style={{ width: `${Math.min((angle / 180) * 100, 100)}%` }}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Side Analytics Panel */}
                    <div className="absolute top-28 right-3 flex flex-col gap-2 opacity-60 hover:opacity-100 transition-opacity">
                        <SignalGraph
                            data={velHistory}
                            max={3}
                            color="#00F0FF"
                            label="VEL"
                            unit="u/s"
                        />
                        <SignalGraph
                            data={accHistory}
                            max={8}
                            color="#F0FF00"
                            label="ACC"
                            unit="G"
                        />
                    </div>

                    {/* Feedback Toast */}
                    {displayFeedback && (
                        <div className={`
                                px-6 py-3 rounded-full font-black text-lg tracking-wider shadow-2xl backdrop-blur-xl border
                                animate-in zoom-in-50 slide-in-from-bottom-4 duration-300
                                ${displayFeedback.includes("PERFECT") || displayFeedback.includes("SPLASH")
                                ? "bg-pro-green/20 border-pro-green text-pro-green shadow-[0_0_20px_rgba(0,230,118,0.3)]"
                                : "bg-red-500/20 border-red-500 text-red-200"}
                            `}>
                            {displayFeedback}
                        </div>
                    )}

                    {/* Guidance Toast */}
                    {displayGuidance && displayStatus === 'SEARCHING' && (
                        <div className="px-4 py-2 bg-black/50 border border-white/10 rounded-lg text-white/70 text-sm font-medium backdrop-blur-md">
                            {displayGuidance}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
