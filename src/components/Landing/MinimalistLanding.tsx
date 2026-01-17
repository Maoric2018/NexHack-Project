"use client";

import React, { useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Line, CameraControls } from '@react-three/drei';
import * as THREE from 'three';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';

// ------------------------------------------------------------------
// GEOMETRIC COMPONENTS
// ------------------------------------------------------------------

function GeometricCourt() {
    const lines = useMemo(() => {
        const points: THREE.Vector3[][] = [];
        const segment = (p1: number[], p2: number[]) => {
            points.push([new THREE.Vector3(p1[0], 0, p1[1]), new THREE.Vector3(p2[0], 0, p2[1])]);
        };
        const width = 15, length = 14;
        segment([-width / 2, 0], [width / 2, 0]); // Baseline
        segment([-width / 2, 0], [-width / 2, length]); // Left
        segment([width / 2, 0], [width / 2, length]); // Right
        segment([-width / 2, length], [width / 2, length]); // Halfcourt

        const keyWidth = 4.9, keyLength = 5.8;
        segment([-keyWidth / 2, 0], [-keyWidth / 2, keyLength]);
        segment([keyWidth / 2, 0], [keyWidth / 2, keyLength]);
        segment([-keyWidth / 2, keyLength], [keyWidth / 2, keyLength]); // Free throw

        // 3pt Arc
        const threePtPoints: THREE.Vector3[] = [];
        threePtPoints.push(new THREE.Vector3(6.75, 0, 0)); // Right corner
        for (let i = 0; i <= 50; i++) {
            const angle = (i / 50) * Math.PI;
            threePtPoints.push(new THREE.Vector3(Math.cos(angle) * 6.75, 0, Math.sin(angle) * 6.75));
        }
        threePtPoints.push(new THREE.Vector3(-6.75, 0, 0)); // Left corner

        return { segments: points, threePt: threePtPoints };
    }, []);

    return (
        <group>
            {lines.segments.map((pts, i) => (
                <Line key={i} points={pts} color="#222" lineWidth={1} segments={false} transparent opacity={0.5} />
            ))}
            <Line points={lines.threePt} color="#333" lineWidth={1} transparent opacity={0.5} />

            <group position={[0, 0, 1.2]}>
                <mesh rotation={[-Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[0.22, 0.24, 32]} />
                    <meshBasicMaterial color="#FF4500" />
                </mesh>
                <Line points={[new THREE.Vector3(-0.9, 0, -0.4), new THREE.Vector3(0.9, 0, -0.4)]} color="#444" lineWidth={1} />
            </group>
        </group>
    );
}

// "Laser" that traces the path
function LaserTrace({ start, end, height, color, delay }: { start: number[], end: number[], height: number, color: string, delay: number }) {
    const lineRef = useRef<any>(null);
    const [points, setPoints] = useState<THREE.Vector3[]>([]);

    // Calculate full curve once
    const fullCurve = useMemo(() => {
        const p1 = new THREE.Vector3(start[0], 0, start[1]);
        const p2 = new THREE.Vector3(end[0], 0, end[1]);
        const curve = new THREE.QuadraticBezierCurve3(
            p1,
            new THREE.Vector3((start[0] + end[0]) / 2, height, (start[1] + end[1]) / 2),
            p2
        );
        return curve.getPoints(60);
    }, [start, end, height]);

    useFrame((state) => {
        const t = state.clock.elapsedTime;
        if (t < delay) return;

        // Cycle every 3 seconds
        const progress = ((t - delay) % 3) / 2; // 2s duration
        if (progress > 1) {
            setPoints([]);
            return;
        }

        // Show segment based on progress (Tail effect)
        const tailLength = 0.3;
        const endIdx = Math.floor(progress * fullCurve.length);
        const startIdx = Math.max(0, Math.floor((progress - tailLength) * fullCurve.length));

        if (endIdx > 0) {
            setPoints(fullCurve.slice(startIdx, endIdx));
        }
    });

    // Don't render Line with fewer than 2 points - it crashes LineGeometry
    if (points.length < 2) return null;

    return (
        <Line
            ref={lineRef}
            points={points}
            color={color}
            lineWidth={0.8}
            transparent
            opacity={0.8}
        />
    );
}

// ------------------------------------------------------------------
// MAIN COMPONENT
// ------------------------------------------------------------------

export default function MinimalistLanding() {
    const router = useRouter();
    const cameraControlsRef = useRef<CameraControls>(null);
    const [isZooming, setIsZooming] = useState(false);

    // Many more trajectories - all smooth white
    const trajectories = useMemo(() => [
        // Left side shots
        { start: [-6.5, 1], end: [0, 1.2], height: 4, color: '#ffffff', delay: 0 },
        { start: [-6, 3], end: [0, 1.2], height: 5, color: '#ffffff', delay: 0.15 },
        { start: [-5.5, 5], end: [0, 1.2], height: 5.5, color: '#ffffff', delay: 0.3 },
        { start: [-4, 7], end: [0, 1.2], height: 6, color: '#ffffff', delay: 0.45 },
        { start: [-3, 8], end: [0, 1.2], height: 6.5, color: '#ffffff', delay: 0.6 },
        // Right side shots
        { start: [6.5, 1], end: [0, 1.2], height: 4, color: '#ffffff', delay: 0.75 },
        { start: [6, 3], end: [0, 1.2], height: 5, color: '#ffffff', delay: 0.9 },
        { start: [5.5, 5], end: [0, 1.2], height: 5.5, color: '#ffffff', delay: 1.05 },
        { start: [4, 7], end: [0, 1.2], height: 6, color: '#ffffff', delay: 1.2 },
        { start: [3, 8], end: [0, 1.2], height: 6.5, color: '#ffffff', delay: 1.35 },
        // Top arc shots
        { start: [-2, 9], end: [0, 1.2], height: 7, color: '#ffffff', delay: 1.5 },
        { start: [0, 10], end: [0, 1.2], height: 7.5, color: '#ffffff', delay: 1.65 },
        { start: [2, 9], end: [0, 1.2], height: 7, color: '#ffffff', delay: 1.8 },
        // Mid-range
        { start: [-4, 4], end: [0, 1.2], height: 4.5, color: '#ffffff', delay: 1.95 },
        { start: [4, 4], end: [0, 1.2], height: 4.5, color: '#ffffff', delay: 2.1 },
        { start: [-2, 5], end: [0, 1.2], height: 4, color: '#ffffff', delay: 2.25 },
        { start: [2, 5], end: [0, 1.2], height: 4, color: '#ffffff', delay: 2.4 },
        // Corner 3s
        { start: [-6.75, 0.5], end: [0, 1.2], height: 3.5, color: '#ffffff', delay: 2.55 },
        { start: [6.75, 0.5], end: [0, 1.2], height: 3.5, color: '#ffffff', delay: 2.7 },
        // Extra depth
        { start: [-5, 6], end: [0, 1.2], height: 5.8, color: '#ffffff', delay: 0.1 },
        { start: [5, 6], end: [0, 1.2], height: 5.8, color: '#ffffff', delay: 0.25 },
        { start: [-3, 6], end: [0, 1.2], height: 5.2, color: '#ffffff', delay: 0.5 },
        { start: [3, 6], end: [0, 1.2], height: 5.2, color: '#ffffff', delay: 0.65 },
        { start: [0, 7], end: [0, 1.2], height: 5.5, color: '#ffffff', delay: 0.85 },
        { start: [-1, 8], end: [0, 1.2], height: 6.2, color: '#ffffff', delay: 1.0 },
    ], []);

    const handleStart = () => {
        setIsZooming(true);
        cameraControlsRef.current?.setLookAt(0, 10, 5, 0, 0, 0, true);
        setTimeout(() => {
            router.push('/coach');
        }, 1200);
    };

    return (
        <div className="relative w-full h-screen bg-black overflow-hidden selection:bg-cyan-500/30 font-mono">

            {/* 3D Canvas - positioned to the right */}
            <div className="absolute inset-0 z-0">
                <Canvas orthographic camera={{ zoom: 35, position: [3, 20, 5] }}>
                    <CameraControls ref={cameraControlsRef} maxPolarAngle={Math.PI / 2} minZoom={10} maxZoom={200} />

                    <group rotation={[-Math.PI / 4, 0, 0]} position={[2, 0, 0]}>
                        <GeometricCourt />
                        {trajectories.map((t, i) => (
                            <LaserTrace key={i} {...t} />
                        ))}
                    </group>

                    <ambientLight intensity={0.3} />
                </Canvas>
            </div>

            {/* HUD UI */}
            <div className={`relative z-10 flex flex-col justify-between h-full p-12 transition-opacity duration-500 ${isZooming ? 'opacity-0' : 'opacity-100'}`}>

                {/* Header HUD */}
                <div className="flex justify-between items-start border-t border-white/20 pt-4">
                    <div>
                        <h2 className="text-[10px] text-gray-500 tracking-[0.2em] mb-1">OPTICAL ARRAY: ACTIVE</h2>
                        <h1 className="text-4xl font-light tracking-tighter text-white">
                            SWISH<span className="font-bold text-cyan-500">PRO</span>
                        </h1>
                    </div>
                    <div className="text-right">
                        <div className="flex items-center justify-end gap-2 text-[10px] text-cyan-500">
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
                            SYS_READY
                        </div>
                        <p className="text-[10px] text-gray-600 mt-1">34.0522°N / 118.2437°W</p>
                    </div>
                </div>

                {/* Left-aligned Action */}
                <div className="self-start max-w-md space-y-6">
                    <div className="space-y-2">
                        <p className="text-[10px] text-gray-500 tracking-[0.3em] uppercase">Form Analysis System</p>
                        <h2 className="text-5xl font-extralight text-white leading-tight">
                            Perfect your <br />
                            <span className="text-cyan-400">shooting form</span>
                        </h2>
                        <p className="text-sm text-gray-500 mt-4 leading-relaxed">
                            AI-powered biomechanics analysis. Real-time feedback.
                            Track every shot with precision physics simulation.
                        </p>
                    </div>

                    <button
                        onClick={handleStart}
                        className="group relative flex items-center gap-4 px-10 py-5 border border-white/20 bg-black/70 hover:bg-white/5 backdrop-blur-sm transition-all duration-500 hover:border-cyan-500/50"
                    >
                        <div className="absolute -top-1 -left-1 w-3 h-3 border-t border-l border-white/30 group-hover:border-cyan-500 transition-colors" />
                        <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b border-r border-white/30 group-hover:border-cyan-500 transition-colors" />

                        <span className="text-2xl font-light tracking-widest text-white group-hover:text-cyan-400 transition-colors">INITIALIZE</span>
                        <ArrowRight className="w-5 h-5 text-gray-500 group-hover:text-cyan-400 transition-all duration-300 transform group-hover:translate-x-2" />
                    </button>
                </div>

                {/* Footer Data */}
                <div className="flex justify-between items-end border-b border-white/20 pb-4">
                    <div className="text-[10px] text-gray-600">
                        build_v2.0.4<br />
                        latency: 12ms
                    </div>
                    <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((_: number, idx: number) => (
                            <div key={idx} className="w-1 bg-gray-800" style={{ height: [12, 22, 15, 8, 18][idx] }} />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

