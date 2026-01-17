"use client";

import React, { useRef, useEffect, useState } from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';

interface SplitViewProps {
    videoBlob?: Blob;
    children: React.ReactNode; // 3D scene
    onPlayStateChange?: (playing: boolean) => void;
}

export function SplitView({ videoBlob, children, onPlayStateChange }: SplitViewProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [videoUrl, setVideoUrl] = useState<string | null>(null);

    // Create video URL from blob
    useEffect(() => {
        if (videoBlob) {
            const url = URL.createObjectURL(videoBlob);
            setVideoUrl(url);
            return () => URL.revokeObjectURL(url);
        }
    }, [videoBlob]);

    // Sync play state
    const togglePlay = () => {
        const newState = !isPlaying;
        setIsPlaying(newState);
        onPlayStateChange?.(newState);

        if (videoRef.current) {
            if (newState) {
                videoRef.current.play();
            } else {
                videoRef.current.pause();
            }
        }
    };

    // Reset
    const reset = () => {
        setIsPlaying(false);
        onPlayStateChange?.(false);
        setCurrentTime(0);
        if (videoRef.current) {
            videoRef.current.pause();
            videoRef.current.currentTime = 0;
        }
    };

    // Update timeline
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const handleTimeUpdate = () => setCurrentTime(video.currentTime);
        const handleLoadedMetadata = () => setDuration(video.duration);
        const handleEnded = () => {
            setIsPlaying(false);
            onPlayStateChange?.(false);
        };

        video.addEventListener('timeupdate', handleTimeUpdate);
        video.addEventListener('loadedmetadata', handleLoadedMetadata);
        video.addEventListener('ended', handleEnded);

        return () => {
            video.removeEventListener('timeupdate', handleTimeUpdate);
            video.removeEventListener('loadedmetadata', handleLoadedMetadata);
            video.removeEventListener('ended', handleEnded);
        };
    }, [onPlayStateChange, videoUrl]);

    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

    return (
        <div className="w-full space-y-4">
            {/* Split Screen */}
            <div className="grid grid-cols-2 gap-4 h-[350px]">
                {/* Video Replay */}
                <div className="relative bg-black rounded-xl overflow-hidden border border-white/10">
                    {videoUrl ? (
                        <video
                            ref={videoRef}
                            src={videoUrl}
                            className="w-full h-full object-cover"
                            muted
                            playsInline
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-500">
                            <div className="text-center">
                                <div className="text-4xl mb-2">📹</div>
                                <div className="text-sm">No recording available</div>
                            </div>
                        </div>
                    )}
                    <div className="absolute top-3 left-3 bg-black/60 px-3 py-1 rounded-full text-xs text-white/80 font-mono">
                        VIDEO REPLAY
                    </div>
                </div>

                {/* 3D Scene */}
                <div className="relative">
                    {children}
                    <div className="absolute top-3 left-3 bg-black/60 px-3 py-1 rounded-full text-xs text-white/80 font-mono">
                        3D RECONSTRUCTION
                    </div>
                </div>
            </div>

            {/* Playback Controls */}
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                <div className="flex items-center gap-4">
                    <button
                        onClick={togglePlay}
                        className="w-12 h-12 rounded-full bg-pro-blue flex items-center justify-center hover:bg-pro-blue/80 transition-colors"
                    >
                        {isPlaying ? (
                            <Pause className="w-5 h-5 text-white" />
                        ) : (
                            <Play className="w-5 h-5 text-white ml-0.5" />
                        )}
                    </button>

                    <button
                        onClick={reset}
                        className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
                    >
                        <RotateCcw className="w-4 h-4 text-white" />
                    </button>

                    {/* Timeline */}
                    <div className="flex-1">
                        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-pro-blue to-pro-green transition-all duration-100"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                        <div className="flex justify-between mt-1 text-xs text-gray-500 font-mono">
                            <span>{formatTime(currentTime)}</span>
                            <span>{formatTime(duration)}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}
