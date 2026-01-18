"use client";

import React, { useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Trail, Line, Float } from '@react-three/drei';
import * as THREE from 'three';
import { PhysicsResult } from '@/lib/physics';

// ------------------------------------------------------------------
// NEON VOID COURT
// ------------------------------------------------------------------
function NeonCourt() {
    // Generate 3pt arc points flat on ground (Y=0)
    const threePtPoints = useMemo(() => {
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= 40; i++) {
            const t = (i / 40) * Math.PI;
            pts.push(new THREE.Vector3(Math.cos(t) * 6.75, 0, Math.sin(t) * 6.75));
        }
        return pts;
    }, []);

    return (
        <group>
            {/* Infinite Void Floor */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
                <planeGeometry args={[50, 50]} />
                <meshBasicMaterial color="#000000" />
            </mesh>

            {/* Minimalist Grid */}
            <gridHelper args={[20, 40, 0x1a1a1a, 0x0a0a0a]} position={[0, 0, 0]} />

            {/* Court Lines - flat on ground */}
            <group position={[0, 0.01, 0]}>
                {/* 3pt Arc */}
                <Line points={threePtPoints} color="#333" lineWidth={1.5} />

                {/* Key Fill (Semi-transparent) */}
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.005, 2.9]}>
                    <planeGeometry args={[4.9, 5.8]} />
                    <meshBasicMaterial color="#06b6d4" transparent opacity={0.05} />
                </mesh>

                {/* Key rectangle outline */}
                <Line
                    points={[
                        new THREE.Vector3(-2.45, 0, 0),
                        new THREE.Vector3(-2.45, 0, 5.8),
                        new THREE.Vector3(2.45, 0, 5.8),
                        new THREE.Vector3(2.45, 0, 0),
                    ]}
                    color="#22d3ee"
                    lineWidth={2}
                />

                {/* Free throw circle */}
                <Line
                    points={(() => {
                        const pts: THREE.Vector3[] = [];
                        for (let i = 0; i <= 32; i++) {
                            const a = (i / 32) * Math.PI * 2;
                            pts.push(new THREE.Vector3(Math.cos(a) * 1.8, 0, Math.sin(a) * 1.8 + 5.8));
                        }
                        return pts;
                    })()}
                    color="#333"
                    lineWidth={1}
                />

                {/* Free throw line */}
                <Line
                    points={[
                        new THREE.Vector3(-2.45, 0, 5.8),
                        new THREE.Vector3(2.45, 0, 5.8),
                    ]}
                    color="#22d3ee"
                    lineWidth={2}
                />
            </group>

            {/* Hoop Assembly */}
            <group position={[0, 0, 0]}>
                {/* Backboard - flat rectangle */}
                <Line
                    points={[
                        new THREE.Vector3(-0.9, 3.5, -0.1),
                        new THREE.Vector3(0.9, 3.5, -0.1),
                        new THREE.Vector3(0.9, 4.1, -0.1),
                        new THREE.Vector3(-0.9, 4.1, -0.1),
                        new THREE.Vector3(-0.9, 3.5, -0.1),
                    ]}
                    color="#444"
                    lineWidth={2}
                />

                {/* Rim - orange torus */}
                <mesh position={[0, 3.05, 0.15]} rotation={[Math.PI / 2, 0, 0]}>
                    <torusGeometry args={[0.225, 0.015, 8, 24]} />
                    <meshBasicMaterial color="#FF4500" />
                </mesh>

                {/* Pole */}
                <Line
                    points={[
                        new THREE.Vector3(0, 0, -0.5),
                        new THREE.Vector3(0, 3.8, -0.5),
                    ]}
                    color="#222"
                    lineWidth={1}
                />
            </group>
        </group>
    );
}


// ------------------------------------------------------------------
// NEON SKELETON
// ------------------------------------------------------------------
function SkeletonPlayer({ motionData, isPlaying, frameIndex }: { motionData?: any[][], isPlaying: boolean, frameIndex: number }) {
    // Skeleton topology
    const connections = [
        [11, 12], [11, 23], [12, 24], [23, 24], // Torso
        [12, 14], [14, 16], // R Arm
        [11, 13], [13, 15], // L Arm
        [24, 26], [26, 28], // R Leg
        [23, 25], [25, 27]  // L Leg
    ];

    const landmarks = useMemo(() => {
        if (!motionData || motionData.length === 0) return null;
        const idx = Math.min(Math.floor(frameIndex), motionData.length - 1);
        return motionData[idx];
    }, [motionData, frameIndex]);

    if (!landmarks) return null;

    const getPos = (idx: number) => {
        const pt = landmarks[idx];
        if (!pt || (pt.visibility || 0) < 0.3) return null;
        return new THREE.Vector3(
            (pt.x - 0.5) * -5,
            (1 - pt.y) * 3.5 - 0.5,
            0
        );
    };

    return (
        <group position={[0, 0, 2]}> {/* Player Offset */}
            {/* Joints */}
            {[11, 12, 13, 14, 15, 16].map(idx => { // Upper body only dots?
                const pos = getPos(idx);
                if (!pos) return null;
                return (
                    <mesh key={idx} position={pos}>
                        <sphereGeometry args={[0.08]} />
                        <meshBasicMaterial color="white" />
                    </mesh>
                )
            })}

            {/* Bones (Lines) */}
            {connections.map(([a, b], i) => {
                const p1 = getPos(a);
                const p2 = getPos(b);
                if (!p1 || !p2) return null;
                return (
                    <Line
                        key={i}
                        points={[p1, p2]}
                        color="#00F0FF"
                        lineWidth={3}
                        transparent
                        opacity={0.8}
                    />
                )
            })}
        </group>
    );
}

// ------------------------------------------------------------------
// GLOWING BALL - Clean Cyan
// ------------------------------------------------------------------
function GlowingBall({ isPlaying, frameIndex, totalFrames, trajectory }: {
    isPlaying: boolean,
    frameIndex: number,
    totalFrames: number,
    trajectory?: { x: number; y: number; z: number }[]
}) {
    if (!trajectory || trajectory.length === 0) return null;

    const progress = totalFrames > 0 ? (frameIndex / totalFrames) : 0;
    const scaledIndex = progress * (trajectory.length - 1);
    const idx = Math.floor(scaledIndex);
    const nextIdx = Math.min(idx + 1, trajectory.length - 1);
    const alpha = scaledIndex - idx;

    const p1 = trajectory[idx];
    const p2 = trajectory[nextIdx];
    if (!p1 || !p2) return null;

    const x = p1.x + (p2.x - p1.x) * alpha;
    const y = (p1.y + (p2.y - p1.y) * alpha);
    const z = (p1.z + (p2.z - p1.z) * alpha) + 2;

    if (!isPlaying) return null;

    return (
        <group position={[x, y, z]}>
            {/* Clean Cyan Ball */}
            <mesh>
                <sphereGeometry args={[0.12, 16, 16]} />
                <meshBasicMaterial color="#22d3ee" />
            </mesh>
            {/* Subtle Glow */}
            <mesh>
                <sphereGeometry args={[0.18, 16, 16]} />
                <meshBasicMaterial color="#06b6d4" transparent opacity={0.25} depthWrite={false} />
            </mesh>
        </group>
    );
}

// ------------------------------------------------------------------
// CONTROLLER
// ------------------------------------------------------------------
function PlaybackController({ motionData, isPlaying, onFrameUpdate }: {
    motionData?: any[][],
    isPlaying: boolean,
    onFrameUpdate: (idx: number) => void
}) {
    const frameRef = useRef(0);
    useFrame((_, delta) => {
        if (isPlaying && motionData && motionData.length > 0) {
            frameRef.current = (frameRef.current + delta * 30) % motionData.length;
            onFrameUpdate(frameRef.current);
        }
    });

    useEffect(() => {
        if (!isPlaying) {
            frameRef.current = 0;
            onFrameUpdate(0);
        }
    }, [isPlaying, onFrameUpdate]);

    return null;
}

// ------------------------------------------------------------------
// MAIN SCENE
// ------------------------------------------------------------------
export interface CourtSceneProps {
    physics?: PhysicsResult;
    motionData?: any[][];
    isPlaying: boolean;
    playerPosition?: { x: number; z: number };
}

export function CourtScene({ physics, motionData, isPlaying, playerPosition }: CourtSceneProps) {
    const [frameIndex, setFrameIndex] = useState(0);
    const handleFrameUpdate = useCallback((idx: number) => setFrameIndex(idx), []);

    // Player Adjustment Group
    const PlayerGroup = ({ children }: { children: React.ReactNode }) => {
        const groupRef = useRef<THREE.Group>(null);
        useFrame(() => {
            if (groupRef.current && playerPosition) {
                groupRef.current.position.set(playerPosition.x, 0, playerPosition.z);
                groupRef.current.lookAt(0, 0, 0); // Face hoop at origin
            } else if (groupRef.current) {
                // Default position (Free Throw)
                groupRef.current.position.set(0, 0, 4.2);
                groupRef.current.lookAt(0, 0, 0);
            }
        });
        return <group ref={groupRef}>{children}</group>;
    };

    return (
        <div className="w-full h-full rounded-none overflow-hidden bg-black relative">
            {/* CRT Scanline Overlay */}
            <div className="absolute inset-0 z-10 pointer-events-none bg-[url('/scanlines.png')] opacity-10 mix-blend-overlay" />
            <div className="absolute inset-0 z-10 pointer-events-none shadow-[inset_0_0_100px_rgba(0,0,0,0.9)]" />

            <Canvas dpr={[1, 2]}>
                <PerspectiveCamera makeDefault position={[0, 5, 10]} fov={50} />

                <PlaybackController
                    motionData={motionData}
                    isPlaying={isPlaying}
                    onFrameUpdate={handleFrameUpdate}
                />

                <group position={[0, -1, 0]}>
                    <NeonCourt />

                    <PlayerGroup>
                        <SkeletonPlayer motionData={motionData} isPlaying={isPlaying} frameIndex={frameIndex} />

                        {/* Dotted Trajectory Path */}
                        {physics?.trajectoryPoints && physics.trajectoryPoints.length > 1 && (
                            <Line
                                points={physics.trajectoryPoints.map(p => new THREE.Vector3(p.x, p.y, p.z + 2))}
                                color="#22d3ee"
                                lineWidth={1.5}
                                dashed
                                dashSize={0.15}
                                gapSize={0.1}
                            />
                        )}

                        <GlowingBall
                            isPlaying={isPlaying}
                            frameIndex={frameIndex}
                            totalFrames={motionData?.length || 30}
                            trajectory={physics?.trajectoryPoints}
                        />
                    </PlayerGroup>
                </group>

                <OrbitControls
                    target={[0, 1, 2]}
                    maxPolarAngle={Math.PI / 2}
                    minDistance={3}
                    maxDistance={15}
                    enableZoom={true}
                    enablePan={true}
                />
            </Canvas>
        </div>
    );
}
