import { PosePipeline } from "@/components/Coach/PosePipeline";
import { HUDContainer } from "@/components/UI/HUDContainer";

export default function CoachPage() {
    return (
        <div className="relative w-full h-screen bg-iron-dark overflow-hidden">
            {/* Main Vision Pipeline (Camera + AI + Canvas) */}
            <div className="absolute inset-0 z-0">
                <PosePipeline />
            </div>

            {/* Top Left Info */}
            <div className="absolute top-4 left-4 z-10 pointer-events-none">
                <HUDContainer title="Session Info" className="w-64">
                    <div className="text-sm font-rajdhani text-gray-300">
                        <p>Status: <span className="text-neon-cyan drop-shadow-[0_0_5px_rgba(0,240,255,0.8)]">ACTIVE</span></p>
                        <p>Mode: <span className="text-neon-cyan">FORM CHECK</span></p>
                    </div>
                </HUDContainer>
            </div>

            {/* Bottom Controls */}
            <div className="absolute bottom-4 w-full flex justify-center z-10 px-4 pointer-events-none">
                <HUDContainer className="flex items-center gap-4 w-full max-w-2xl justify-center">
                    <div className="text-white font-orbitron animate-pulse">WAITING FOR PLAYER...</div>
                </HUDContainer>
            </div>
        </div>
    );
}
