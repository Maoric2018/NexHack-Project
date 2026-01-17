"use client";

import React, { useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { PhysicsResult } from '@/lib/physics';

// ------------------------------------------------------------------
// PRO CYBER COURT
// ------------------------------------------------------------------
function CyberCourt() {
    return (
        <group>
            {/* Reflective Dark Floor */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
                <planeGeometry args={[20, 20]} />
                <meshStandardMaterial
                    color="#050510"
                    roughness={0.1}
                    metalness={0.8}
                    envMapIntensity={1}
                />
            </mesh>

            {/* Neon Grid Lines */}
            <gridHelper args={[20, 20, 0x00F0FF, 0x111122]} position={[0, 0.01, 0]} />

            {/* 3-Point Line (Glowing) */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 1]}>
                <ringGeometry args={[6.75, 6.85, 64, 1, 0, Math.PI]} />
                <meshBasicMaterial color="#00F0FF" toneMapped={false} />
            </mesh>

            {/* Key Area (Holographic Red) */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 5]}>
                <planeGeometry args={[4.88, 5.8]} />
                <meshBasicMaterial color="#FF0055" transparent opacity={0.1} side={THREE.DoubleSide} />
            </mesh>

            {/* Hoop Assembly */}
            <group position={[0, 0, 7.5]}>
                {/* Pole */}
                <mesh position={[0, 2, 1]} castShadow>
                    <cylinderGeometry args={[0.1, 0.1, 4, 16]} />
                    <meshStandardMaterial color="#333" />
                </mesh>
                {/* Backboard */}
                <mesh position={[0, 3.95, 0.4]} castShadow>
                    <boxGeometry args={[1.83, 1.22, 0.1]} />
                    <meshPhysicalMaterial color="white" transmission={0.9} thickness={0.5} roughness={0} />
                </mesh>
                {/* Rim */}
                <mesh position={[0, 3.05, 0]} rotation={[Math.PI / 2, 0, 0]}>
                    <torusGeometry args={[0.225, 0.02, 16, 32]} />
                    <meshStandardMaterial color="#FF4500" emissive="#FF4500" emissiveIntensity={0.5} />
                </mesh>
            </group>
        </group>
    );
}

// ------------------------------------------------------------------
// HOLOGRAPHIC PLAYER (Reconsructed from Motion Data)
// ------------------------------------------------------------------
function HologramPlayer({ motionData, isPlaying, frameIndex }: { motionData?: any[][], isPlaying: boolean, frameIndex: number }) {
    const groupRef = useRef<THREE.Group>(null);

    // Skeleton topology (pairs of indices to connect)
    const connections = [
        [11, 12], [11, 23], [12, 24], [23, 24], // Torso
        [12, 14], [14, 16], // R Arm
        [11, 13], [13, 15], // L Arm
        [24, 26], [26, 28], // R Leg
        [23, 25], [25, 27]  // L Leg
    ];

    // Current Frame Landmarks
    const landmarks = useMemo(() => {
        if (!motionData || motionData.length === 0) return null;
        const idx = Math.min(Math.floor(frameIndex), motionData.length - 1);
        return motionData[idx];
    }, [motionData, frameIndex]);

    if (!landmarks) return null;

    // Helper to map 2D (0..1) to 3D Space
    // X -> -5 to 5
    // Y -> 0 to 4 (Inverted 1-y)
    // Z -> 0 (Flat plane, maybe slightly curved?)
    const getPos = (idx: number) => {
        const pt = landmarks[idx];
        if (!pt || (pt.visibility || 0) < 0.3) return null;
        return new THREE.Vector3(
            (pt.x - 0.5) * -5, // Scale width, flip X
            (1 - pt.y) * 4 - 1, // Scale height, offset
            0
        );
    };

    // Get wrist position for basketball
    const wristPos = getPos(16) || getPos(15); // Right wrist, fallback to left

    return (
        <group ref={groupRef} position={[0, 0, 2]}>
            {/* HEAD (nose/face area) */}
            {(() => {
                const nose = getPos(0);
                if (!nose) return null;
                return (
                    <mesh position={nose}>
                        <sphereGeometry args={[0.15, 24, 24]} />
                        <meshStandardMaterial
                            color="#00F0FF"
                            emissive="#00F0FF"
                            emissiveIntensity={0.8}
                            transparent
                            opacity={0.9}
                        />
                    </mesh>
                );
            })()}

            {/* GLOWING JOINTS */}
            {[11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28].map(idx => {
                const pos = getPos(idx);
                if (!pos) return null;
                return (
                    <mesh key={idx} position={pos}>
                        <sphereGeometry args={[0.1, 16, 16]} />
                        <meshStandardMaterial
                            color="#00F0FF"
                            emissive="#00F0FF"
                            emissiveIntensity={1.2}
                        />
                    </mesh>
                )
            })}

            {/* GLOWING BONES */}
            {connections.map(([a, b], i) => {
                const p1 = getPos(a);
                const p2 = getPos(b);
                if (!p1 || !p2) return null;

                const dist = p1.distanceTo(p2);
                const mid = p1.clone().add(p2).multiplyScalar(0.5);
                const quaternion = new THREE.Quaternion();
                const up = new THREE.Vector3(0, 1, 0);
                const axis = p1.clone().sub(p2).normalize();
                quaternion.setFromUnitVectors(up, axis);

                return (
                    <mesh key={i} position={mid} quaternion={quaternion}>
                        <cylinderGeometry args={[0.05, 0.05, dist, 12]} />
                        <meshStandardMaterial
                            color="#00F0FF"
                            emissive="#0088FF"
                            emissiveIntensity={0.6}
                            transparent
                            opacity={0.85}
                        />
                    </mesh>
                )
            })}

            {/* BASKETBALL (Glowing Orange) */}
            {wristPos && (
                <mesh position={wristPos}>
                    <sphereGeometry args={[0.14, 24, 24]} />
                    <meshStandardMaterial
                        color="#FF6B00"
                        emissive="#FF4500"
                        emissiveIntensity={0.5}
                        roughness={0.4}
                    />
                </mesh>
            )}
        </group>
    );
}

// ------------------------------------------------------------------
// ANIMATED SHOOTING BALL (Real Physics Trajectory)
// ------------------------------------------------------------------
function ShootingBall({ isPlaying, frameIndex, totalFrames, trajectory }: {
    isPlaying: boolean,
    frameIndex: number,
    totalFrames: number,
    trajectory?: { x: number; y: number; z: number }[]
}) {
    const meshRef = useRef<THREE.Mesh>(null);

    // If no real physics trajectory, don't render or fallback?
    // User requested "fix inaccurate trajectory", so we rely on the physics one.
    if (!trajectory || trajectory.length === 0) return null;

    // Map frame progress to trajectory progress
    // Assume the shot clip covers the full flight? 
    // Usually clip is human motion. Ball keeps flying.
    // We'll loop the ball flight to match the player loop duration for visual sync.
    const progress = totalFrames > 0 ? (frameIndex / totalFrames) : 0;

    // Get current point indices
    const scaledIndex = progress * (trajectory.length - 1);
    const idx = Math.floor(scaledIndex);
    const nextIdx = Math.min(idx + 1, trajectory.length - 1);
    const alpha = scaledIndex - idx;

    // Interpolate position
    const p1 = trajectory[idx];
    const p2 = trajectory[nextIdx];

    // Player Group Offset (from CourtScene structure)
    // The player group is at [0, 0, 2]
    // The physics trajectory Z is "forward distance" from release point.
    // We add this to the player's Z.
    const playerZ = 2; // Player base Z
    const playerY = 0; // Player base Y (feet)

    const x = p1.x + (p2.x - p1.x) * alpha;
    const y = (p1.y + (p2.y - p1.y) * alpha) + playerY;
    const z = (p1.z + (p2.z - p1.z) * alpha) + playerZ;

    // Rotation: ball spins
    const rotX = frameIndex * 0.3;
    const rotZ = frameIndex * 0.2;

    if (!isPlaying) return null;

    return (
        <mesh ref={meshRef} position={[x, y, z]} rotation={[rotX, 0, rotZ]}>
            <sphereGeometry args={[0.12, 24, 24]} />
            <meshStandardMaterial
                color="#FF6B00"
                roughness={0.5}
                emissive="#FF4500"
                emissiveIntensity={0.3}
            />
        </mesh>
    );
}


// ------------------------------------------------------------------
// PLAYBACK CONTROLLER (Must be INSIDE Canvas)
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

    return null; // Component renders nothing, just runs logic
}


// ------------------------------------------------------------------
// MAIN SCENE
// ------------------------------------------------------------------
export interface CourtSceneProps {
    physics?: PhysicsResult;
    motionData?: any[][]; // Array of landmarks for each frame
    isPlaying: boolean;
}

export function CourtScene({ physics, motionData, isPlaying }: CourtSceneProps) {
    const [frameIndex, setFrameIndex] = useState(0);

    // Memoize callback to prevent re-renders
    const handleFrameUpdate = useCallback((idx: number) => {
        setFrameIndex(idx);
    }, []);

    return (
        <div className="w-full h-full rounded-xl overflow-hidden border border-white/10 bg-black">
            <Canvas shadows dpr={[1, 2]}>
                <PerspectiveCamera makeDefault position={[0, 2, -6]} fov={50} />

                {/* Cyber Lighting */}
                <ambientLight intensity={0.2} />
                <spotLight position={[10, 10, 10]} angle={0.5} penumbra={1} intensity={1} castShadow />
                <pointLight position={[-10, 5, -10]} intensity={0.5} color="#00F0FF" />

                {/* Environment */}
                <Environment preset="city" />

                {/* Playback Logic (MUST be inside Canvas) */}
                <PlaybackController
                    motionData={motionData}
                    isPlaying={isPlaying}
                    onFrameUpdate={handleFrameUpdate}
                />

                <group position={[0, -1, 0]}>
                    <CyberCourt />
                    <HologramPlayer motionData={motionData} isPlaying={isPlaying} frameIndex={frameIndex} />
                    <ShootingBall
                        isPlaying={isPlaying}
                        frameIndex={frameIndex}
                        totalFrames={motionData?.length || 30}
                        trajectory={physics?.trajectoryPoints}
                    />
                </group>

                <OrbitControls
                    target={[0, 1, 2]}
                    maxPolarAngle={Math.PI / 2}
                    minDistance={3}
                    maxDistance={12}
                />
            </Canvas>
        </div>
    );
}
