"use client";

import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Text, Html, useCursor, Edges } from '@react-three/drei';
import * as THREE from 'three';
import { useRouter } from 'next/navigation';
import { ArrowRight, Disc, MapPin, BarChart3, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for classes
function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(inputs));
}

// ------------------------------------------------------------------
// UTILS
// ------------------------------------------------------------------

function CameraRig({ stage }: { stage: 'landing' | 'selecting_spot' | 'selecting_count' }) {
    useFrame((state, delta) => {
        // Landing: Top-Left Isometric [-20, 20, 20], Zoom 35
        // Selection: Top Down [0, 50, 0], Zoom 40 for distinct map-like selection.

        const targetPos = stage === 'landing'
            ? new THREE.Vector3(-20, 20, 20) // Top Left
            : new THREE.Vector3(0, 50, 10); // Slight angle for selection

        const targetZoom = stage === 'landing' ? 25 : 40;
        const targetLookAt = stage === 'landing' ? new THREE.Vector3(0, 0, 0) : new THREE.Vector3(0, 0, 5);

        // Smooth interpolate
        state.camera.position.lerp(targetPos, delta * 2.0); // Slightly slower ease
        state.camera.zoom = THREE.MathUtils.lerp(state.camera.zoom, targetZoom, delta * 2.0);

        state.camera.lookAt(targetLookAt);
        state.camera.updateProjectionMatrix();
    });
    return null;
}

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
        segment([-keyWidth / 2, keyLength], [keyWidth / 2, keyLength]); // Free throw line

        // Free Throw Semi-Circle (Top of Key) - Center [0, 5.8], Radius 1.8
        const freeThrowPoints: THREE.Vector3[] = [];
        for (let i = 0; i <= 30; i++) {
            const angle = (i / 30) * Math.PI; // 0 to PI
            freeThrowPoints.push(new THREE.Vector3(Math.cos(angle) * 1.8, 0, 5.8 + Math.sin(angle) * 1.8));
        }

        // 3pt Arc - Hoop is at [0, 1.575]
        const hoopZ = 1.575;
        const threePtPoints: THREE.Vector3[] = [];
        threePtPoints.push(new THREE.Vector3(6.70, 0, 0));
        threePtPoints.push(new THREE.Vector3(6.70, 0, 3.0));
        for (let i = 0; i <= 50; i++) {
            const angle = (i / 50) * Math.PI;
            const x = Math.cos(angle) * 6.75;
            const z = hoopZ + Math.sin(angle) * 6.75;
            threePtPoints.push(new THREE.Vector3(x, 0, z));
        }

        // Restricted Area Arc
        const restrictedPoints: THREE.Vector3[] = [];
        for (let i = 0; i <= 30; i++) {
            const angle = (i / 30) * Math.PI;
            restrictedPoints.push(new THREE.Vector3(Math.cos(angle) * 1.25, 0, hoopZ + Math.sin(angle) * 1.25));
        }

        return { segments: points, threePt: threePtPoints, restricted: restrictedPoints, freeThrow: freeThrowPoints };
    }, []);

    const lineMat = useMemo(() => new THREE.LineBasicMaterial({ color: 0x666666, transparent: true, opacity: 0.6 }), []);
    const whiteMat = useMemo(() => new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }), []);

    return (
        <group>
            {lines.segments.map((pts, i) => {
                const geo = new THREE.BufferGeometry().setFromPoints(pts);
                return <primitive key={i} object={new THREE.Line(geo, lineMat)} />;
            })}
            <primitive object={new THREE.Line(new THREE.BufferGeometry().setFromPoints(lines.freeThrow), lineMat)} />
            <primitive object={new THREE.Line(new THREE.BufferGeometry().setFromPoints(lines.threePt), whiteMat)} />
            <primitive object={new THREE.Line(new THREE.BufferGeometry().setFromPoints(lines.restricted), lineMat)} />

            {/* Hoop Assembly */}
            <group position={[0, 3.05, 1.575]}>
                <mesh rotation={[-Math.PI / 2, 0, 0]}>
                    <torusGeometry args={[0.225, 0.012, 16, 32]} />
                    <meshBasicMaterial color="#FF4500" />
                </mesh>
                <mesh position={[0, -0.2, 0]}>
                    <cylinderGeometry args={[0.225, 0.15, 0.4, 32, 1, true]} />
                    <meshBasicMaterial color="white" wireframe opacity={0.3} transparent />
                </mesh>
                <group position={[0, 0.15, -0.15]}>
                    <mesh position={[0, 0.5, 0]}>
                        <boxGeometry args={[1.8, 1.05, 0.05]} />
                        <meshBasicMaterial color="#444" transparent opacity={0.2} wireframe />
                    </mesh>
                </group>
            </group>

            <mesh position={[0, 1.5, 2]}>
                <cylinderGeometry args={[0.05, 0.05, 3, 8]} />
                <meshBasicMaterial color="#222" />
            </mesh>
        </group>
    );
}

// ------------------------------------------------------------------
// SHADER ANIMATION COMPONENT
// ------------------------------------------------------------------

const TrajectoryShaderMaterial = {
    uniforms: {
        color: { value: new THREE.Color("#ffffff") },
        progress: { value: 0 },
        opacity: { value: 1.0 }
    },
    vertexShader: `
        varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`,
    fragmentShader: `
        uniform vec3 color;
        uniform float progress;
        uniform float opacity;
        varying vec2 vUv;

void main() {
            float alpha = opacity;
            float edge = smoothstep(progress, progress - 0.05, vUv.x);
    if (vUv.x > progress) discard;
    gl_FragColor = vec4(color, alpha * edge);
}
`
};

function OptimizedShootingTrace({ start, end, height, color, delay, onSwish }: { start: number[], end: number[], height: number, color: string, delay: number, onSwish: () => void }) {
    const meshRef = useRef<THREE.Mesh>(null);
    const circleRef = useRef<THREE.Mesh>(null);
    const swishTriggered = useRef(false);

    const geometry = useMemo(() => {
        const p1 = new THREE.Vector3(start[0], 0, start[1]);
        const p2 = new THREE.Vector3(end[0], 3.05, end[1]);
        const midX = (start[0] + end[0]) / 2;
        const midZ = (start[1] + end[1]) / 2;
        const curve = new THREE.QuadraticBezierCurve3(
            p1,
            new THREE.Vector3(midX, height, midZ),
            p2
        );
        return new THREE.TubeGeometry(curve, 32, 0.03, 6, false);
    }, [start, end, height]);

    const material = useMemo(() => {
        return new THREE.ShaderMaterial({
            ...TrajectoryShaderMaterial,
            uniforms: {
                color: { value: new THREE.Color(color) },
                progress: { value: 0 },
                opacity: { value: 0 },
            },
            transparent: true,
            depthWrite: false,
        });
    }, [color]);

    useFrame((state) => {
        if (!meshRef.current || !circleRef.current) return;
        const mat = meshRef.current.material as THREE.ShaderMaterial;
        const matBasic = circleRef.current.material as THREE.MeshBasicMaterial;

        // Use Offset Phase for "always busy" look
        const cycleDuration = 5.0;
        const t = state.clock.elapsedTime + delay; // Offset by delay
        const localTime = t % cycleDuration;
        const shotDuration = 1.5;

        // Reset swish trigger
        if (localTime < 0.1) swishTriggered.current = false;

        circleRef.current.visible = true;

        if (localTime < shotDuration) {
            const p = localTime / shotDuration;
            mat.uniforms.progress.value = p;
            mat.uniforms.opacity.value = 1.0;

            const circleAlpha = Math.min(1, localTime * 5);
            matBasic.opacity = circleAlpha * 0.5;
        } else {
            const timeSinceLand = localTime - shotDuration;
            const fadeProgress = Math.min(1, timeSinceLand / 2.0);

            mat.uniforms.progress.value = 1.0;
            const alpha = 1.0 - fadeProgress;
            mat.uniforms.opacity.value = alpha;
            matBasic.opacity = alpha * 0.5;

            if (!swishTriggered.current && timeSinceLand > 0) {
                onSwish();
                swishTriggered.current = true;
            }
        }
    });

    return (
        <group>
            {/* Raycast null to prevent blocking clicks */}
            <mesh ref={circleRef} position={[start[0], 0.02, start[1]]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
                <circleGeometry args={[0.2, 16]} />
                <meshBasicMaterial color={color} transparent opacity={0} depthWrite={false} />
            </mesh>
            <mesh ref={meshRef} geometry={geometry} material={material} raycast={() => null} />
        </group>
    );
}

// ------------------------------------------------------------------
// MANAGERS & INTERACTION
// ------------------------------------------------------------------

function SwishManager({ count }: { count: number }) {
    const [swishes, setSwishes] = useState<{ id: number, startTime: number }[]>([]);

    useEffect(() => {
        if (count > 0) {
            setSwishes(prev => [...prev, { id: Date.now() + Math.random(), startTime: Date.now() }]);
        }
    }, [count]);

    useEffect(() => {
        const interval = setInterval(() => {
            setSwishes(prev => {
                const now = Date.now();
                const active = prev.filter(s => now - s.startTime < 3000); // Longer life
                if (active.length !== prev.length) return active;
                return prev;
            });
        }, 500);
        return () => clearInterval(interval);
    }, []);

    return (
        <group position={[0, 4.8, 1.575]}>
            {swishes.map(s => (
                <Html key={s.id} center pointerEvents="none" zIndexRange={[100, 0]}>
                    <div className="flex flex-col items-center animate-float-up opacity-0">
                        <div className="px-3 py-1 bg-cyan-500/20 backdrop-blur-md border border-cyan-400/30 rounded-full shadow-[0_0_15px_rgba(6,182,212,0.3)]">
                            <span className="text-cyan-400 font-bold text-xs tracking-wider uppercase">Swish</span>
                        </div>
                        <div className="h-4 w-[1px] bg-gradient-to-b from-cyan-400/50 to-transparent mt-1" />
                    </div>
                </Html>
            ))}
        </group>
    );
}

function CourtInteraction({ active, onSelect, selectedPoint }: { active: boolean, onSelect: (pt: { x: number, z: number }) => void, selectedPoint: { x: number, z: number } | null }) {
    const groupRef = useRef<THREE.Group>(null);
    const [hovered, setHovered] = useState(false);
    const [previewSpot, setPreviewSpot] = useState<{ x: number, z: number } | null>(null);
    useCursor(hovered && active);

    const handlePointerMove = (e: any) => {
        if (!active || !groupRef.current) return;
        e.stopPropagation();
        const pt = groupRef.current.worldToLocal(e.point.clone());
        setPreviewSpot({ x: pt.x, z: pt.z });
    };

    const handleClick = (e: any) => {
        if (!active || !groupRef.current) return;
        e.stopPropagation();
        const pt = groupRef.current.worldToLocal(e.point.clone());
        onSelect({ x: pt.x, z: pt.z });
    };

    return (
        <group ref={groupRef}>
            {/* Invisible Hit Plane - Matches Court Dimensions */}
            {active && (
                <mesh
                    rotation={[-Math.PI / 2, 0, 0]}
                    position={[0, 0.01, 7]}
                    onPointerOver={() => setHovered(true)}
                    onPointerOut={() => { setHovered(false); setPreviewSpot(null); }}
                    onPointerMove={handlePointerMove}
                    onClick={handleClick}
                >
                    <planeGeometry args={[15, 14]} />
                    <meshBasicMaterial color="black" visible={false} />
                </mesh>
            )}

            {/* Ghost Pin (Preview) */}
            {active && previewSpot && (
                <group position={[previewSpot.x, 0, previewSpot.z]}>
                    <mesh position={[0, 0.5, 0]}>
                        <cylinderGeometry args={[0.05, 0.02, 1, 8]} />
                        <meshBasicMaterial color="#06b6d4" transparent opacity={0.3} />
                    </mesh>
                    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
                        <ringGeometry args={[0.2, 0.3, 32]} />
                        <meshBasicMaterial color="#06b6d4" transparent opacity={0.2} />
                    </mesh>
                </group>
            )}

            {/* Selected Pin */}
            {selectedPoint && (
                <group position={[selectedPoint.x, 0, selectedPoint.z]}>
                    <mesh position={[0, 0.5, 0]}>
                        <cylinderGeometry args={[0.05, 0.02, 1, 8]} />
                        <meshBasicMaterial color="#06b6d4" />
                    </mesh>
                    <mesh position={[0, 1, 0]}>
                        <sphereGeometry args={[0.15, 16, 16]} />
                        <meshBasicMaterial color="#22d3ee" toneMapped={false} />
                    </mesh>
                    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
                        <ringGeometry args={[0.2, 0.3, 32]} />
                        <meshBasicMaterial color="#06b6d4" transparent opacity={0.5} />
                    </mesh>
                    <Html position={[0, 1.5, 0]} center pointerEvents="none">
                        <div className="px-2 py-1 bg-black/80 backdrop-blur text-[10px] text-cyan-400 border border-cyan-500/50 rounded whitespace-nowrap">
                            SHOOTING SPOT
                        </div>
                    </Html>
                </group>
            )}
        </group>
    );
}

export default function MinimalistLanding() {
    const router = useRouter();
    const [swishCount, setSwishCount] = useState(0);

    // Interaction State
    const [stage, setStage] = useState<'landing' | 'selecting_spot' | 'selecting_count'>('landing');
    const [selectedSpot, setSelectedSpot] = useState<{ x: number, z: number } | null>(null);

    const handleSwish = () => setSwishCount(c => c + 1);

    const trajectories = useMemo(() => {
        const shots: any[] = [];
        const count = 20;
        const r = (min: number, max: number) => Math.random() * (max - min) + min;
        const zones = [[-7, -5], [5, 7], [-6, -3], [3, 6], [-2, 2]]; // Ranges

        for (let i = 0; i < count; i++) {
            const z = zones[i % zones.length];
            const startX = r(z[0], z[1]);
            const startZ = r(2, 8); // Random depth

            // Phase offset instead of delay
            const delay = r(0, 5);

            const dist = Math.sqrt(startX * startX + (startZ - 1.575) * (startZ - 1.575));
            const height = 4.5 + dist * 0.4 + r(-0.2, 0.2);

            shots.push({
                start: [startX, startZ],
                end: [0, 1.575],
                height: height,
                color: '#ffffff',
                delay: delay
            });
        }
        return shots;
    }, []);

    const handleSpotSelect = (pt: { x: number, z: number }) => {
        setSelectedSpot(pt);
        setStage('selecting_count');
    };

    const handleCountSelect = (count: number) => {
        const spotStr = selectedSpot ? `${selectedSpot.x.toFixed(2)},${selectedSpot.z.toFixed(2)}` : '0,0';
        router.push(`/coach?spot=${spotStr}&count=${count}`);
    };

    return (
        <div className="relative w-full h-screen bg-black overflow-hidden selection:bg-cyan-500/30 font-mono">
            {/* 3D Scene */}
            <div className="absolute inset-0 z-0">
                <Canvas orthographic gl={{ antialias: true }} dpr={[1, 2]}>
                    <CameraRig stage={stage} />

                    <group position={[5, -5, 5]} rotation={[0, -Math.PI / 2, 0]}>
                        <GeometricCourt />

                        {trajectories.map((t, i) => (
                            <OptimizedShootingTrace key={i} {...t} onSwish={handleSwish} />
                        ))}
                        <SwishManager count={swishCount} />

                        <CourtInteraction active={stage === 'selecting_spot'} onSelect={handleSpotSelect} selectedPoint={selectedSpot} />
                    </group>

                    <ambientLight intensity={0.4} />
                    <pointLight position={[10, 20, 10]} intensity={0.5} />
                </Canvas>
            </div>

            {/* UI Layer */}
            <div className="relative z-10 flex flex-col justify-between h-full p-12 pointer-events-none">
                {/* Header */}
                <div className="flex justify-between items-start border-t border-white/20 pt-4">
                    <div>
                        <h2 className="text-[10px] text-gray-500 tracking-[0.2em] mb-1">OPTICAL ARRAY: ACTIVE</h2>
                        <h1 className="text-4xl font-light tracking-tighter text-white">
                            SWISH<span className="font-bold text-cyan-500">PRO</span>
                        </h1>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="self-start max-w-md space-y-6 pointer-events-auto">

                    {/* STAGE: LANDING */}
                    {stage === 'landing' && (
                        <div className="space-y-6 animate-fade-in">
                            <div className="space-y-2">
                                <p className="text-[10px] text-gray-500 tracking-[0.3em] uppercase">Form Analysis System</p>
                                <h2 className="text-5xl font-extralight text-white leading-tight">
                                    Perfect your <br />
                                    <span className="text-cyan-400">shooting form</span>
                                </h2>
                                <p className="text-sm text-gray-500 mt-4 leading-relaxed">
                                    Select your spot. Set your rep count. Let AI analyze your biomechanics in real-time.
                                </p>
                            </div>

                            <button
                                onClick={() => setStage('selecting_spot')}
                                className="group relative flex items-center gap-4 px-10 py-5 border border-white/20 bg-black/70 hover:bg-white/5 backdrop-blur-sm transition-all duration-500 hover:border-cyan-500/50"
                            >
                                <div className="absolute -top-1 -left-1 w-3 h-3 border-t border-l border-white/30 group-hover:border-cyan-500 transition-colors" />
                                <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b border-r border-white/30 group-hover:border-cyan-500 transition-colors" />

                                <span className="text-2xl font-light tracking-widest text-white group-hover:text-cyan-400 transition-colors">ENTER</span>
                                <ArrowRight className="w-5 h-5 text-gray-500 group-hover:text-cyan-400 transition-all duration-300 transform group-hover:translate-x-2" />
                            </button>
                        </div>
                    )}

                    {/* STAGE: SELECT SPOT */}
                    {stage === 'selecting_spot' && (
                        <div className="space-y-4 animate-fade-in bg-black/80 p-6 border border-white/10 backdrop-blur-md rounded-lg">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-cyan-500/10 rounded-full">
                                    <MapPin className="w-5 h-5 text-cyan-400" />
                                </div>
                                <h3 className="text-xl text-white font-light">Drop Your Pin</h3>
                            </div>
                            <p className="text-sm text-gray-400">
                                Click anywhere on the court floor to mark your exact shooting spot.
                            </p>
                        </div>
                    )}

                    {/* STAGE: SELECT COUNT */}
                    {stage === 'selecting_count' && (
                        <div className="space-y-6 animate-fade-in bg-black/80 p-8 border border-white/10 backdrop-blur-md rounded-lg w-full">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-cyan-500/10 rounded-full">
                                    <BarChart3 className="w-5 h-5 text-cyan-400" />
                                </div>
                                <div>
                                    <h3 className="text-xl text-white font-light">Shot Count</h3>
                                    <p className="text-[10px] text-gray-400 uppercase tracking-wider">Target Reps</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                {[10, 25, 50, 100].map(num => (
                                    <button
                                        key={num}
                                        onClick={() => handleCountSelect(num)}
                                        className="flex items-center justify-between px-4 py-3 border border-white/10 hover:border-cyan-500/50 hover:bg-cyan-500/10 transition-all group"
                                    >
                                        <span className="text-xl font-light text-white group-hover:text-cyan-400">{num}</span>
                                        <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-cyan-400 opacity-0 group-hover:opacity-100 transition-all" />
                                    </button>
                                ))}
                            </div>

                            <button
                                onClick={() => setStage('selecting_spot')}
                                className="text-xs text-gray-500 hover:text-white transition-colors mt-4"
                            >
                                ← Back to Spot Selection
                            </button>
                        </div>
                    )}

                </div>

                <div className="flex justify-between items-end border-b border-white/20 pb-4">
                    <div className="text-[10px] text-gray-600">
                        build_v2.1.0<br />
                        latency: 12ms
                    </div>
                </div>
            </div>

            {/* Global Styles for Animations */}
            <style jsx global>{`
                @keyframes float-up {
                    0% { transform: translateY(0); opacity: 1; }
                    100% { transform: translateY(-30px); opacity: 0; }
                }
                .animate-float-up {
                    animation: float-up 1.5s ease-out forwards;
                }
                .animate-fade-in {
                    animation: fade-in 0.5s ease-out forwards;
                }
                @keyframes fade-in {
                    0% { opacity: 0; transform: translateY(10px); }
                    100% { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
}
