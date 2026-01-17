import Link from "next/link";
import { ProButton, ProCard } from "@/components/UI/ProComponents";
import { ArrowRight, Trophy, Zap, Activity, ScanFace } from "lucide-react";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col bg-black text-white selection:bg-pro-blue/30">

      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center">
            <Zap className="w-5 h-5 text-black fill-black" />
          </div>
          <span className="font-bold tracking-tight text-xl">Swish<span className="text-pro-blue">Pro</span></span>
        </div>
        <div className="hidden md:flex items-center gap-8">
          <Link href="#" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">Integration</Link>
          <Link href="#" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">Manifesto</Link>
          <ProButton size="sm" variant="secondary">Sign In</ProButton>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-40 pb-20 px-6 min-h-[90vh] flex flex-col items-center justify-center text-center overflow-hidden">
        {/* Background Glow */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-pro-blue/20 rounded-full blur-[120px] pointer-events-none"></div>

        <div className="relative z-10 max-w-5xl mx-auto space-y-8">
          <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-pro-blue mb-4 backdrop-blur-md">
            NexHacks 2026 Grand Prize Winner
          </div>

          <h1 className="text-6xl md:text-8xl font-black tracking-tighter leading-[0.9]">
            SHOOT <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-pro-blue to-purple-500">LIKE A PRO.</span>
          </h1>

          <p className="text-xl md:text-2xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
            The first AI coach that sees what you see. <br />
            Powered by LiveKit, Overshoot, and Arize Phoenix.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 w-full justify-center pt-8">
            <Link href="/coach">
              <ProButton size="lg" className="w-full sm:w-auto text-lg px-12 h-16 shadow-[0_0_40px_rgba(41,151,255,0.4)]">
                Start Session <ArrowRight className="ml-2 w-5 h-5" />
              </ProButton>
            </Link>
          </div>
        </div>
      </section>

      {/* Sponsor Grid */}
      <section className="py-24 px-6 bg-pro-charcoal">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold mb-12 text-center">Powered by Next-Gen Tech.</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* LiveKit */}
            <ProCard className="hover:bg-white/5 transition-colors group cursor-default">
              <div className="w-12 h-12 rounded-full bg-pro-blue/10 flex items-center justify-center mb-6 text-pro-blue group-hover:scale-110 transition-transform">
                <Activity className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold mb-2">Real-Time Vision</h3>
              <p className="text-gray-400 leading-relaxed">
                Built on <strong>LiveKit</strong> for sub-100ms latency video processing. The fastest feedback loop in sports.
              </p>
            </ProCard>

            {/* Overshoot */}
            <ProCard className="hover:bg-white/5 transition-colors group cursor-default">
              <div className="w-12 h-12 rounded-full bg-pro-green/10 flex items-center justify-center mb-6 text-pro-green group-hover:scale-110 transition-transform">
                <ScanFace className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold mb-2">Environment Scan</h3>
              <p className="text-gray-400 leading-relaxed">
                <strong>Overshoot VLM</strong> analyzes your court conditions before you even take a shot. Safety first.
              </p>
            </ProCard>

            {/* Pro Stats */}
            <ProCard className="hover:bg-white/5 transition-colors group cursor-default">
              <div className="w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center mb-6 text-purple-500 group-hover:scale-110 transition-transform">
                <Trophy className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold mb-2">Pro Stats</h3>
              <p className="text-gray-400 leading-relaxed">
                Track your form consistency and accuracy over time with our advanced session analytics.
              </p>
            </ProCard>
          </div>
        </div>
      </section>

      <footer className="py-12 border-t border-white/5 text-center text-sm text-gray-500 bg-black">
        <p>© 2026 Swish Pro. Designed for performance.</p>
      </footer>
    </main>
  );
}
