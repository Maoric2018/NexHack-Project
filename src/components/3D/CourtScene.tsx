"use client";

import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment, Text } from '@react-three/drei';
import * as THREE from 'three';
import { ShotRecord } from '@/lib/shotTypes';

// Basketball Court Floor
function Court() {
    return (
        <group>
            {/* Court floor */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
                <planeGeometry args={[15, 14]} />
                <meshStandardMaterial color="#C4A484" />
            </mesh>

            {/* Court lines */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
                <ringGeometry args={[1.8, 1.85, 32]} />
                <meshBasicMaterial color="white" />
            </mesh>

            {/* Free throw line */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 4]}>
                <planeGeometry args={[3.6, 0.05]} />
                <meshBasicMaterial color="white" />
            </mesh>

            {/* Key/Paint */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 5]}>
                <planeGeometry args={[3.6, 5.8]} />
                <meshStandardMaterial color="#8B4513" transparent opacity={0.3} />
            </mesh>

            {/* Backboard */}
            <mesh position={[0, 3.5, 7]} castShadow>
                <boxGeometry args={[1.8, 1.05, 0.05]} />
                <meshStandardMaterial color="white" transparent opacity={0.8} />
            </mesh>

            {/* Rim */}
            <mesh position={[0, 3.05, 6.85]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.23, 0.02, 16, 32]} />
                <meshStandardMaterial color="#FF4500" />
            </mesh>
        </group>
    );
}

// Animated Stick Figure Player
function Player({ shot, isAnimating }: { shot?: ShotRecord; isAnimating: boolean }) {
    const groupRef = useRef<THREE.Group>(null);
    const armRef = useRef<THREE.Group>(null);
    const animationProgress = useRef(0);

    useFrame((_, delta) => {
        if (isAnimating && armRef.current) {
            animationProgress.current += delta * 2;
            if (animationProgress.current > Math.PI) {
                animationProgress.current = 0;
            }

            // Animate arm from set position to release
            const angle = Math.sin(animationProgress.current) * 0.8;
            armRef.current.rotation.x = -Math.PI / 4 + angle;
        }
    });

    return (
        <group ref={groupRef} position={[0, 0, 2]}>
            {/* Body */}
            <mesh position={[0, 1.2, 0]} castShadow>
                <capsuleGeometry args={[0.15, 0.6, 4, 8]} />
                <meshStandardMaterial color="#2997FF" />
            </mesh>

            {/* Head */}
            <mesh position={[0, 1.8, 0]} castShadow>
                <sphereGeometry args={[0.15, 16, 16]} />
                <meshStandardMaterial color="#FFD5B4" />
            </mesh>

            {/* Shooting Arm */}
            <group ref={armRef} position={[0.2, 1.4, 0]} rotation={[-Math.PI / 4, 0, 0]}>
                <mesh position={[0, 0.25, 0]} castShadow>
                    <capsuleGeometry args={[0.05, 0.4, 4, 8]} />
                    <meshStandardMaterial color="#2997FF" />
                </mesh>

                {/* Forearm */}
                <group position={[0, 0.5, 0]} rotation={[0.5, 0, 0]}>
                    <mesh position={[0, 0.2, 0]} castShadow>
                        <capsuleGeometry args={[0.04, 0.3, 4, 8]} />
                        <meshStandardMaterial color="#FFD5B4" />
                    </mesh>

                    {/* Basketball */}
                    <mesh position={[0, 0.4, 0]} castShadow>
                        <sphereGeometry args={[0.12, 16, 16]} />
                        <meshStandardMaterial color="#FF6B00" />
                    </mesh>
                </group>
            </group>

            {/* Legs */}
            <mesh position={[-0.1, 0.4, 0]} rotation={[0, 0, 0.1]} castShadow>
                <capsuleGeometry args={[0.06, 0.6, 4, 8]} />
                <meshStandardMaterial color="#1a1a2e" />
            </mesh>
            <mesh position={[0.1, 0.4, 0]} rotation={[0, 0, -0.1]} castShadow>
                <capsuleGeometry args={[0.06, 0.6, 4, 8]} />
                <meshStandardMaterial color="#1a1a2e" />
            </mesh>
        </group>
    );
}

// Ball Trajectory Arc
function BallTrajectory({ visible }: { visible: boolean }) {
    const lineRef = useRef<THREE.Line>(null);

    const lineGeometry = useMemo(() => {
        const curve = new THREE.QuadraticBezierCurve3(
            new THREE.Vector3(0, 1.8, 2),    // Start (player's hands)
            new THREE.Vector3(0, 4.5, 4.5),  // Peak
            new THREE.Vector3(0, 3.05, 6.85) // End (rim)
        );
        return new THREE.BufferGeometry().setFromPoints(curve.getPoints(30));
    }, []);

    const lineMaterial = useMemo(() => new THREE.LineBasicMaterial({
        color: 0x00E676,
        transparent: true,
        opacity: 0.6
    }), []);

    if (!visible) return null;

    return <primitive ref={lineRef} object={new THREE.Line(lineGeometry, lineMaterial)} />;
}

// Main 3D Scene Component
interface CourtSceneProps {
    selectedShot?: ShotRecord;
    isPlaying: boolean;
}

export function CourtScene({ selectedShot, isPlaying }: CourtSceneProps) {
    return (
        <div className="w-full h-full rounded-2xl overflow-hidden">
            <Canvas
                shadows
                camera={{ position: [8, 6, -4], fov: 50 }}
                style={{ background: 'linear-gradient(to bottom, #0a0a0f, #1a1a2e)' }}
            >
                <ambientLight intensity={0.4} />
                <directionalLight
                    position={[10, 15, 5]}
                    intensity={1}
                    castShadow
                    shadow-mapSize={[2048, 2048]}
                />
                <pointLight position={[0, 8, 0]} intensity={0.5} color="#ff9900" />

                <Court />
                <Player shot={selectedShot} isAnimating={isPlaying} />
                <BallTrajectory visible={isPlaying} />

                <OrbitControls
                    enablePan={false}
                    minDistance={5}
                    maxDistance={20}
                    minPolarAngle={0.2}
                    maxPolarAngle={Math.PI / 2.2}
                />

                {/* Atmosphere */}
                <fog attach="fog" args={['#0a0a0f', 15, 30]} />
            </Canvas>
        </div>
    );
}
