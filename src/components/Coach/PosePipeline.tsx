"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import Script from "next/script";
import { CameraFeed } from "@/components/Coach/CameraFeed";
import { drawSkeleton } from "@/lib/poseUtils";
import { HUDContainer } from "@/components/UI/HUDContainer";
import { useShotAnalysis } from "@/hooks/useShotAnalysis";
import { audioCoach } from "@/lib/audioFeedback";
import { NeonButton } from "@/components/UI/NeonButton";

// Define minimal types for MediaPipe to avoid build errors
interface MPResults {
    poseLandmarks: { x: number; y: number; z: number; visibility: number }[];
    poseWorldLandmarks?: { x: number; y: number; z: number; visibility: number }[];
}

export function PosePipeline() {
    const [poseInstance, setPoseInstance] = useState<any>(null);
    const [scriptLoaded, setScriptLoaded] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const requestRef = useRef<number>(0);
    const [isMuted, setIsMuted] = useState(false);

    const { analyzeFrame, angle, state, feedback, isPerfect } = useShotAnalysis();

    // Initialize MediaPipe Pose after script loads
    useEffect(() => {
        if (scriptLoaded && typeof window !== 'undefined' && (window as any).Pose) {
            console.log("Initializing MediaPipe Pose...");
            const Pose = (window as any).Pose;
            const pose = new Pose({
                locateFile: (file: string) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
                },
            });

            pose.setOptions({
                modelComplexity: 1,
                smoothLandmarks: true,
                enableSegmentation: false,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5,
            });

            pose.onResults(onResults);
            setPoseInstance(pose);

            return () => {
                pose.close();
            };
        }
    }, [scriptLoaded]); // eslint-disable-next-line react-hooks/exhaustive-deps

    const onResults = useCallback((results: MPResults) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (results.poseLandmarks) {
            const points = results.poseLandmarks.map(l => ({ x: l.x, y: l.y, visibility: l.visibility }));
            drawSkeleton(ctx, points);
            analyzeFrame(points);
        }
    }, [analyzeFrame]);

    const startLoop = () => {
        const loop = async () => {
            if (videoRef.current && poseInstance && !videoRef.current.paused && !videoRef.current.ended) {
                if (canvasRef.current && canvasRef.current.width !== videoRef.current.videoWidth) {
                    canvasRef.current.width = videoRef.current.videoWidth;
                    canvasRef.current.height = videoRef.current.videoHeight;
                }
                await poseInstance.send({ image: videoRef.current });
                requestRef.current = requestAnimationFrame(loop);
            }
        };
        loop();
    };

    useEffect(() => {
        if (poseInstance && videoRef.current) {
            startLoop();
        }
        return () => cancelAnimationFrame(requestRef.current);
    }, [poseInstance]); // eslint-disable-next-line react-hooks/exhaustive-deps

    const toggleMute = () => {
        const muted = audioCoach.toggleMute();
        setIsMuted(muted);
    };

    return (
        <div className="relative w-full h-full">
            {/* Load MediaPipe Script */}
            <Script
                src="https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js"
                strategy="afterInteractive"
                onLoad={() => setScriptLoaded(true)}
            />

            <CameraFeed onVideoReady={(v) => {
                videoRef.current = v;
                if (poseInstance) startLoop();
            }} />

            <canvas
                ref={canvasRef}
                className="absolute top-0 left-0 w-full h-full object-cover pointer-events-none"
            />

            {/* HUD Overlay */}
            <div className="absolute top-24 right-4 w-72 space-y-4 pointer-events-none transition-all duration-300">
                <HUDContainer title="Real-time Metrics" className="pointer-events-auto">
                    <div className="space-y-4">
                        <div className="space-y-1">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-400 font-rajdhani">Elbow Angle</span>
                                <span className={`font-orbitron ${isPerfect ? 'text-neon-green' : 'text-neon-cyan'}`}>{angle}°</span>
                            </div>
                            <div className="h-2 bg-gray-800 rounded-full overflow-hidden border border-gray-700">
                                <div
                                    className={`h-full transition-all duration-300 ${isPerfect ? 'bg-neon-green shadow-[0_0_10px_#00FF9D]' : 'bg-neon-magenta shadow-[0_0_10px_#FF003C]'}`}
                                    style={{ width: `${Math.min((angle / 180) * 100, 100)}%` }}
                                />
                            </div>
                            <div className="flex justify-between text-[10px] text-gray-600 font-mono">
                                <span>0°</span>
                                <span>90°</span>
                                <span>180°</span>
                            </div>
                        </div>

                        <div className="flex justify-between items-center text-xs text-gray-400">
                            <span>Phase</span>
                            <span className="text-white font-bold">{state}</span>
                        </div>

                        <NeonButton
                            variant="cyan"
                            onClick={toggleMute}
                            className="w-full text-xs py-1"
                        >
                            {isMuted ? "UNMUTE COACH" : "MUTE COACH"}
                        </NeonButton>
                    </div>
                </HUDContainer>

                <HUDContainer className={`border-l-4 transition-colors duration-300 ${isPerfect ? 'border-l-neon-green' : 'border-l-neon-magenta'}`}>
                    <div className={`text-xl font-orbitron font-bold uppercase ${isPerfect ? 'text-neon-green text-glow' : 'text-neon-magenta text-glow-red'} animate-pulse`}>
                        {feedback}
                    </div>
                </HUDContainer>
            </div>
        </div>
    );
}
