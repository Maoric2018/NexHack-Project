"use client";

import React, { useRef, useMemo, useEffect, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { PhysicsResult } from '@/lib/physics';

// Professional NBA-style Court
function Court() {
    return (
        <group>
            {/* Main Court */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
                <planeGeometry args={[15, 14]} />
                <meshStandardMaterial color="#CD853F" roughness={0.4} metalness={0.1} />
            </mesh>

            {/* Paint/Key Area */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 5]}>
                <planeGeometry args={[4.88, 5.8]} />
                <meshStandardMaterial color="#8B0000" roughness={0.5} />
            </mesh>

            {/* Free Throw Circle */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 4.19]}>
                <ringGeometry args={[1.75, 1.82, 64]} />
                <meshBasicMaterial color="white" />
            </mesh>

            {/* Free Throw Line */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 4.19]}>
                <planeGeometry args={[3.66, 0.08]} />
                <meshBasicMaterial color="white" />
            </mesh>

            {/* Three Point Line */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 1]}>
                <ringGeometry args={[6.75, 6.82, 64, 1, 0, Math.PI]} />
                <meshBasicMaterial color="white" />
            </mesh>

            {/* Backboard */}
            <mesh position={[0, 3.95, 7.9]} castShadow>
                <boxGeometry args={[1.83, 1.22, 0.08]} />
                <meshPhysicalMaterial color="#ffffff" transparent opacity={0.4} roughness={0} metalness={0.2} />
            </mesh>

            {/* Rim */}
            <mesh position={[0, 3.05, 7.5]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.225, 0.015, 16, 32]} />
                <meshStandardMaterial color="#FF4500" metalness={0.8} roughness={0.2} />
            </mesh>

            {/* Net */}
            <mesh position={[0, 2.75, 7.5]}>
                <cylinderGeometry args={[0.225, 0.15, 0.4, 12, 1, true]} />
                <meshBasicMaterial color="#FFFFFF" wireframe transparent opacity={0.6} />
            </mesh>

            {/* Backboard Support */}
            <mesh position={[0, 2.5, 8.3]} castShadow>
                <cylinderGeometry args={[0.08, 0.08, 5, 16]} />
                <meshStandardMaterial color="#333" metalness={0.9} roughness={0.1} />
            </mesh>
        </group>
    );
}

// Animated Basketball with Physics
function AnimatedBall({ isPlaying, physics }: { isPlaying: boolean; physics?: PhysicsResult }) {
    const meshRef = useRef<THREE.Mesh>(null);
    const [progress, setProgress] = useState(0);

    // Ball texture pattern
    const ballMaterial = useMemo(() => new THREE.MeshStandardMaterial({
        color: '#FF6B00',
        roughness: 0.7,
        metalness: 0.1,
    }), []);

    useFrame((_, delta) => {
        if (!isPlaying || !physics || !meshRef.current) return;

        // Animate along trajectory
        setProgress(prev => {
            const next = prev + delta * 0.8;
            return next > 1 ? 0 : next;
        });

        // Get position from trajectory
        const idx = Math.floor(progress * (physics.trajectoryPoints.length - 1));
        const point = physics.trajectoryPoints[Math.min(idx, physics.trajectoryPoints.length - 1)];

        if (point) {
            meshRef.current.position.set(point.x, point.y, point.z + 2);
            // Spin the ball
            meshRef.current.rotation.x += delta * 5;
            meshRef.current.rotation.z += delta * 3;
        }
    });

    // Reset when not playing
    useEffect(() => {
        if (!isPlaying) setProgress(0);
    }, [isPlaying]);

    if (!isPlaying) return null;

    return (
        <mesh ref={meshRef} material={ballMaterial} castShadow position={[0, 1.8, 2]}>
            <sphereGeometry args={[0.12, 32, 32]} />
        </mesh>
    );
}

// Professional Player Model
function Player({ isPlaying }: { isPlaying: boolean }) {
    const groupRef = useRef<THREE.Group>(null);
    const armRef = useRef<THREE.Group>(null);
    const [phase, setPhase] = useState(0);

    useFrame((_, delta) => {
        if (!isPlaying || !armRef.current) return;

        setPhase(prev => {
            const next = prev + delta * 2;
            return next > Math.PI ? 0 : next;
        });

        // Shooting motion
        const t = Math.sin(phase);
        armRef.current.rotation.x = -0.8 - t * 0.6;
    });

    useEffect(() => {
        if (!isPlaying) setPhase(0);
    }, [isPlaying]);

    return (
        <group ref={groupRef} position={[0, 0, 2]}>
            {/* Jersey/Torso */}
            <mesh position={[0, 1.15, 0]} castShadow>
                <capsuleGeometry args={[0.22, 0.45, 8, 16]} />
                <meshStandardMaterial color="#1E3A5F" roughness={0.8} />
            </mesh>

            {/* Shorts */}
            <mesh position={[0, 0.75, 0]} castShadow>
                <capsuleGeometry args={[0.18, 0.15, 8, 16]} />
                <meshStandardMaterial color="#FFFFFF" roughness={0.8} />
            </mesh>

            {/* Head */}
            <mesh position={[0, 1.65, 0]} castShadow>
                <sphereGeometry args={[0.12, 32, 32]} />
                <meshStandardMaterial color="#8B4513" roughness={0.6} />
            </mesh>

            {/* Shooting Arm */}
            <group ref={armRef} position={[0.28, 1.35, 0.1]} rotation={[-0.8, 0, 0]}>
                {/* Upper Arm */}
                <mesh position={[0, 0.12, 0]} castShadow>
                    <capsuleGeometry args={[0.05, 0.22, 8, 16]} />
                    <meshStandardMaterial color="#8B4513" roughness={0.6} />
                </mesh>
                {/* Forearm */}
                <group position={[0, 0.3, 0]} rotation={[0.6, 0, 0]}>
                    <mesh position={[0, 0.1, 0]} castShadow>
                        <capsuleGeometry args={[0.04, 0.18, 8, 16]} />
                        <meshStandardMaterial color="#8B4513" roughness={0.6} />
                    </mesh>
                    {/* Hand with ball (only when not shooting) */}
                    {!isPlaying && (
                        <mesh position={[0, 0.25, 0]} castShadow>
                            <sphereGeometry args={[0.12, 32, 32]} />
                            <meshStandardMaterial color="#FF6B00" roughness={0.7} />
                        </mesh>
                    )}
                </group>
            </group>

            {/* Guide Arm */}
            <group position={[-0.25, 1.3, 0.15]} rotation={[-0.6, 0, 0.4]}>
                <mesh position={[0, 0.12, 0]} castShadow>
                    <capsuleGeometry args={[0.04, 0.2, 8, 16]} />
                    <meshStandardMaterial color="#8B4513" roughness={0.6} />
                </mesh>
            </group>

            {/* Legs */}
            <mesh position={[-0.1, 0.38, 0]} rotation={[0.05, 0, 0.08]} castShadow>
                <capsuleGeometry args={[0.06, 0.5, 8, 16]} />
                <meshStandardMaterial color="#8B4513" roughness={0.6} />
            </mesh>
            <mesh position={[0.1, 0.38, 0]} rotation={[0.05, 0, -0.08]} castShadow>
                <capsuleGeometry args={[0.06, 0.5, 8, 16]} />
                <meshStandardMaterial color="#8B4513" roughness={0.6} />
            </mesh>

            {/* Shoes */}
            <mesh position={[-0.1, 0.08, 0.05]} castShadow>
                <boxGeometry args={[0.1, 0.08, 0.18]} />
                <meshStandardMaterial color="#FF0000" roughness={0.8} />
            </mesh>
            <mesh position={[0.1, 0.08, 0.05]} castShadow>
                <boxGeometry args={[0.1, 0.08, 0.18]} />
                <meshStandardMaterial color="#FF0000" roughness={0.8} />
            </mesh>
        </group>
    );
}

// Trajectory Trail
function TrajectoryLine({ physics, visible }: { physics?: PhysicsResult; visible: boolean }) {
    const lineRef = useRef<THREE.Line>(null);

    const { geometry, material } = useMemo(() => {
        if (!physics) return { geometry: null, material: null };

        const points = physics.trajectoryPoints.map(p => new THREE.Vector3(p.x, p.y, p.z + 2));
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const mat = new THREE.LineDashedMaterial({
            color: 0x00FF88,
            dashSize: 0.15,
            gapSize: 0.08,
            transparent: true,
            opacity: 0.7
        });

        return { geometry: geo, material: mat };
    }, [physics]);

    if (!visible || !geometry || !material) return null;

    return <primitive ref={lineRef} object={new THREE.Line(geometry, material)} />;
}

// Main Scene Export
interface CourtSceneProps {
    physics?: PhysicsResult;
    isPlaying: boolean;
}

export function CourtScene({ physics, isPlaying }: CourtSceneProps) {
    return (
        <div className="w-full h-full rounded-xl overflow-hidden border border-white/10 bg-gradient-to-b from-[#1a1a2e] to-[#0a0a12]">
            <Canvas shadows>
                <PerspectiveCamera makeDefault position={[8, 5, -3]} fov={45} />

                {/* Lighting */}
                <ambientLight intensity={0.4} />
                <directionalLight
                    position={[10, 20, 5]}
                    intensity={1.2}
                    castShadow
                    shadow-mapSize={[2048, 2048]}
                />
                <spotLight position={[0, 12, 5]} intensity={0.8} angle={0.4} penumbra={0.5} color="#FFE4B5" />
                <pointLight position={[-5, 8, -5]} intensity={0.3} color="#4169E1" />

                {/* Scene */}
                <Court />
                <Player isPlaying={isPlaying} />
                <AnimatedBall isPlaying={isPlaying} physics={physics} />
                <TrajectoryLine physics={physics} visible={isPlaying} />

                {/* Controls */}
                <OrbitControls
                    enablePan={false}
                    minDistance={4}
                    maxDistance={20}
                    minPolarAngle={0.2}
                    maxPolarAngle={Math.PI / 2.1}
                    target={[0, 1.5, 4]}
                />

                {/* Atmosphere */}
                <fog attach="fog" args={['#0a0a12', 18, 35]} />
            </Canvas>
        </div>
    );
}
