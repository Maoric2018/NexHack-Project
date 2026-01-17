import { HUDContainer } from "@/components/UI/HUDContainer";
import { NeonButton } from "@/components/UI/NeonButton";
import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_var(--color-iron-card)_0%,_var(--color-iron-dark)_70%)] -z-20" />
      <div className="absolute top-0 left-0 w-full h-full opacity-20 bg-[linear-gradient(rgba(0,240,255,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(0,240,255,0.1)_1px,transparent_1px)] bg-[size:50px_50px] -z-10" />

      <div className="z-10 w-full max-w-md space-y-8 text-center">
        <div className="space-y-2">
          <h1 className="text-7xl font-orbitron font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-neon-cyan to-neon-magenta drop-shadow-[0_0_15px_rgba(0,240,255,0.5)]">
            SWISH
          </h1>
          <p className="text-neon-cyan font-rajdhani text-xl tracking-[0.3em] uppercase drop-shadow-[0_0_5px_rgba(0,240,255,0.8)]">
            AI Form Coach
          </p>
        </div>

        <HUDContainer className="space-y-8 py-10 px-8">
          <div className="space-y-2">
            <h2 className="text-white font-orbitron text-lg tracking-wide">Ready to Train?</h2>
            <p className="text-gray-400 text-sm font-rajdhani">Align your camera. Take your shot.</p>
          </div>

          <div className="flex flex-col gap-4">
            <Link href="/coach">
              <NeonButton variant="cyan" className="w-full h-14 text-lg">
                Start Session
              </NeonButton>
            </Link>
            <NeonButton variant="magenta" className="w-full opacity-50 cursor-not-allowed" disabled>
              View Analytics (Locked)
            </NeonButton>
          </div>
        </HUDContainer>

        <div className="absolute bottom-6 left-0 w-full text-center text-[10px] text-gray-600 font-mono tracking-widest opacity-50">
          NEXHACKS 2026 // PROTOTYPE v0.1
        </div>
      </div>
    </main>
  );
}
