"use client";

import React, { useRef, useState, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, Float, PerspectiveCamera, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { useRouter } from 'next/navigation';
import { ProButton } from '../UI/ProComponents';
import { Zap, PlayCircle, Activity } from 'lucide-react';

// ------------------------------------------------------------------
// SCENE COMPONENTS
// ------------------------------------------------------------------

function Hoop() {
    return (
        <group position={[0, 2, -5]} scale={1.5}>
            {/* Glowing Rim */}
            <mesh position={[0, 3.05, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.225, 0.02, 16, 32]} />
                <meshStandardMaterial
                    color="#FF4500"
                    emissive="#FF4500"
                    emissiveIntensity={2}
                    toneMapped={false}
                />
            </mesh>
            {/* Backboard Glass */}
            <mesh position={[0, 3.95, 0.4]}>
                <boxGeometry args={[1.83, 1.22, 0.1]} />
                <meshPhysicalMaterial
                    color="white"
                    transmission={0.9}
                    thickness={0.5}
                    roughness={0}
                    ior={1.5}
                />
            </mesh>
            {/* Net (simplified cone) */}
            <mesh position={[0, 2.65, 0]}>
                <cylinderGeometry args={[0.22, 0.15, 0.8, 16, 4, true]} />
                <meshBasicMaterial
                    color="white"
                    wireframe
                    transparent
                    opacity={0.3}
                />
            </mesh>
        </group>
    );
}

function ShootingDrillBall({ delay }: { delay: number }) {
    const meshRef = useRef<THREE.Mesh>(null);
    const [started, setStarted] = useState(false);

    // Define Shot Zones
    const zones = [
        { name: 'paint', xRange: [-2, 2], zRange: [1, 4] },
        { name: 'mid_left', xRange: [-5, -3], zRange: [3, 6] },
        { name: 'mid_right', xRange: [3, 5], zRange: [3, 6] },
        { name: 'corner_left', xRange: [-7.5, -6.5], zRange: [0, 2] },
        { name: 'corner_right', xRange: [6.5, 7.5], zRange: [0, 2] },
        { name: 'top_key', xRange: [-2, 2], zRange: [7, 8] },
        { name: 'wing_left', xRange: [-6, -4], zRange: [5, 7] },
        { name: 'wing_right', xRange: [4, 6], zRange: [5, 7] }
    ];

    // Pick random zone and point
    const shotData = useMemo(() => {
        const zone = zones[Math.floor(Math.random() * zones.length)];
        const x = zone.xRange[0] + Math.random() * (zone.xRange[1] - zone.xRange[0]);
        const z = zone.zRange[0] + Math.random() * (zone.zRange[1] - zone.zRange[0]);
        // Randomize speed/arc slightly
        const arcHeight = 3 + Math.random() * 3; // 3m to 6m arc
        const duration = 1.5 + Math.random() * 1.0; // 1.5s to 2.5s flight
        return { start: new THREE.Vector3(x, 0, z), arcHeight, duration };
    }, []);

    useFrame((state) => {
        if (!meshRef.current) return;
        const time = state.clock.elapsedTime;

        if (time < delay) return;
        if (!started) setStarted(true);

        const cycleTime = shotData.duration + 0.5; // flight + rest
        const t = ((time - delay) % cycleTime) / shotData.duration;

        if (t > 1) {
            meshRef.current.position.set(0, -100, 0); // Hide
            return;
        }

        // Target: Hoop Center (relative to scene origin)
        // Hoop group is at [0, 2, -5]. Rim is +3.05y inside group -> y=5.05.
        // Actually, let's target slightly above rim for swish effect
        const target = new THREE.Vector3(0, 5.2, -5);

        // Linear interpolation for X/Z
        const currentPos = new THREE.Vector3().lerpVectors(shotData.start, target, t);

        // Parabolic Y
        // y = y0 + (yTarget - y0)*t + 4 * arcHeight * (t - t^2)  <-- Approximation for arc peaking at mid
        // Better: standard parabolic map
        // Let's use simple sin wave added to linear height
        const linearY = shotData.start.y + (target.y - shotData.start.y) * t;
        const parabolicY = Math.sin(t * Math.PI) * shotData.arcHeight;

        meshRef.current.position.set(currentPos.x, linearY + parabolicY, currentPos.z);

        // Rotation (Heavy backspin)
        meshRef.current.rotation.x -= 0.2;
    });

    return (
        <mesh ref={meshRef} position={[0, -100, 0]}>
            <sphereGeometry args={[0.15, 24, 24]} />
            <meshStandardMaterial
                color="#FF6B00"
                roughness={0.3}
                emissive="#FF4500"
                emissiveIntensity={0.4}
            />
            {/* Trail effect? Simplified via motion blur in post-proc or just quantity */}
        </mesh>
    );
}

function Floor() {
    return (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2, 0]} receiveShadow>
            <planeGeometry args={[50, 50]} />
            <meshStandardMaterial
                color="#050505"
                roughness={0.1}
                metalness={0.8}
            />
            <gridHelper args={[50, 50, '#1a1a1a', '#0a0a0a']} rotation={[-Math.PI / 2, 0, 0]} />
        </mesh>
    );
}

// ------------------------------------------------------------------
// LANDING PAGE COMPONENT
// ------------------------------------------------------------------

export default function LandingScene() {
    const router = useRouter();

    return (
        <div className="relative w-full h-screen bg-black overflow-hidden select-none">

            {/* 3D BACKGROUND */}
            <div className="absolute inset-0 z-0 opacity-60">
                <Canvas shadows dpr={[1, 2]}>
                    <PerspectiveCamera makeDefault position={[0, 2, 12]} fov={45} />
                    <Environment preset="city" />
                    <ambientLight intensity={0.5} />
                    <pointLight position={[10, 10, 10]} intensity={1} color="#00F0FF" />

                    <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
                        <Hoop />
                    </Float>

                    {/* Intense Shooting Drill */}
                    {Array.from({ length: 30 }).map((_, i) => (
                        <ShootingDrillBall key={i} delay={i * 0.4} />
                    ))}

                    <Floor />
                </Canvas>
            </div>

            {/* UI OVERLAY */}
            <div className="relative z-10 flex flex-col items-center justify-center h-full text-center px-4">

                {/* HERO TEXT */}
                <div className="mb-8 space-y-4 animate-in fade-in slide-in-from-bottom-10 duration-1000">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-md mb-4">
                        <Activity className="w-4 h-4 text-emerald-400" />
                        <span className="text-xs font-mono text-emerald-400">STATUS: ONLINE</span>
                    </div>

                    <h1 className="text-7xl md:text-9xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-white via-gray-200 to-gray-600 drop-shadow-2xl">
                        SWISH
                        <span className="text-[#FF4500]">.AI</span>
                    </h1>

                    <p className="text-xl md:text-2xl text-gray-400 max-w-2xl mx-auto font-light leading-relaxed">
                        The world's first <span className="text-white font-semibold">BIO-MECHANICAL</span> shooting coach.
                        <br />
                        <span className="text-sm opacity-60">Powered by Computer Vision & Physics Engine</span>
                    </p>
                </div>

                {/* CTA BUTTONS */}
                <div className="flex flex-col md:flex-row gap-4 w-full max-w-md animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-200">
                    <ProButton
                        size="lg"
                        className="w-full flex-1 group shadow-[0_0_30px_rgba(255,69,0,0.4)] border-amber-500/20"
                        variant="primary"
                        onClick={() => router.push('/coach')}
                    >
                        <Zap className="w-6 h-6 mr-2 group-hover:scale-110 transition-transform text-yellow-400" />
                        ENTER COURT
                    </ProButton>

                    <ProButton
                        size="lg"
                        className="w-full flex-1 bg-white/5 border-white/10 hover:bg-white/10"
                        onClick={() => window.open('https://github.com', '_blank')}
                    >
                        <PlayCircle className="w-6 h-6 mr-2" />
                        DEMO REEL
                    </ProButton>
                </div>

                {/* STATS FOOTER */}
                <div className="absolute bottom-10 left-0 right-0 flex justify-center gap-12 text-gray-500 text-xs font-mono opacity-50">
                    <div>
                        <span className="block text-white text-lg font-bold">98%</span>
                        ACCURACY
                    </div>
                    <div>
                        <span className="block text-white text-lg font-bold">12ms</span>
                        LATENCY
                    </div>
                    <div>
                        <span className="block text-white text-lg font-bold">3D</span>
                        RECONSTRUCTION
                    </div>
                </div>

            </div>
        </div>
    );
}
