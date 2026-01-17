"use client";

import React, { useEffect, useRef, useState } from "react";
import { createLocalVideoTrack, LocalVideoTrack } from "livekit-client";
import { Loader2, CameraOff } from "lucide-react";

interface LiveKitFeedProps {
    onVideoReady?: (video: HTMLVideoElement) => void;
}

export function LiveKitFeed({ onVideoReady }: LiveKitFeedProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [track, setTrack] = useState<LocalVideoTrack | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let mounted = true;

        const initCamera = async () => {
            try {
                const videoTrack = await createLocalVideoTrack({
                    resolution: { width: 1280, height: 720 },
                    facingMode: "user"
                });

                if (mounted) {
                    setTrack(videoTrack);
                    if (videoRef.current) {
                        videoTrack.attach(videoRef.current);

                        // CRITICAL: Wait for video to actually start playing before notifying parent
                        videoRef.current.onloadeddata = () => {
                            console.log("[LiveKitFeed] Video loaded and playing");
                            if (onVideoReady && videoRef.current) {
                                onVideoReady(videoRef.current);
                            }
                        };

                        // Trigger play explicitly
                        videoRef.current.play().catch(e => console.error("Video play failed:", e));
                    }
                } else {
                    videoTrack.stop();
                }
            } catch (err) {
                console.error("Failed to acquire camera:", err);
                if (mounted) setError("Camera access denied. Please check permissions.");
            }
        };

        initCamera();

        return () => {
            mounted = false;
            track?.stop();
            track?.detach();
        };
    }, []); // eslint-disable-next-line react-hooks/exhaustive-deps

    return (
        <div className="relative w-full h-full flex items-center justify-center bg-black overflow-hidden">
            {/* 
                IMPORTANT: transform: scaleX(-1) mirrors the video visually.
                We must ensure the Canvas Overlay in PosePipeline ALSO mirrors the drawing context 
                to match this visual flip.
             */}
            <video
                ref={videoRef}
                className="absolute w-full h-full object-cover transform -scale-x-100"
                autoPlay
                muted
                playsInline
            />

            {!track && !error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-transparent z-20 gap-4">
                    <Loader2 className="w-10 h-10 animate-spin text-pro-blue" />
                    <p className="text-sm text-white/60 font-medium tracking-wide">CONNECTING OPTICS...</p>
                </div>
            )}

            {error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-20 text-center p-6">
                    <CameraOff className="w-12 h-12 text-pro-red mb-4" />
                    <p className="text-white font-bold text-lg">Sensor Offline</p>
                    <p className="text-white/50 text-sm mt-2">{error}</p>
                </div>
            )}
        </div>
    );
}
