"use client";

import React, { useRef, useEffect, useState } from "react";
import Webcam from "react-webcam";

interface CameraFeedProps {
    onVideoReady?: (video: HTMLVideoElement) => void;
}

export function CameraFeed({ onVideoReady }: CameraFeedProps) {
    const webcamRef = useRef<Webcam>(null);
    const [isReady, setIsReady] = useState(false);

    // Poll for video element readiness
    useEffect(() => {
        if (isReady && webcamRef.current?.video && onVideoReady) {
            // Small delay to ensure video dimensions are set
            const timer = setTimeout(() => {
                if (webcamRef.current?.video) {
                    onVideoReady(webcamRef.current.video);
                }
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [isReady, onVideoReady]);

    return (
        <div className="relative w-full h-full flex items-center justify-center bg-black">
            <Webcam
                ref={webcamRef}
                className="absolute w-full h-full object-cover"
                mirrored={true}
                onUserMedia={() => setIsReady(true)}
                screenshotFormat="image/jpeg"
                videoConstraints={{
                    facingMode: "user",
                    width: 1280,
                    height: 720,
                }}
            />

            {!isReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-iron-dark z-20">
                    <div className="text-neon-cyan font-orbitron text-xl animate-pulse tracking-widest">Initializing Sensor Array...</div>
                </div>
            )}
        </div>
    );
}
