import { cn } from "@/lib/utils";
import React from "react";

interface NeonButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: "cyan" | "magenta" | "green";
    glow?: boolean;
}

export const NeonButton = React.forwardRef<HTMLButtonElement, NeonButtonProps>(
    ({ className, variant = "cyan", glow = true, children, ...props }, ref) => {
        const baseStyles =
            "relative px-6 py-2 font-bold uppercase tracking-widest transition-all duration-300 border-2 bg-transparent hover:bg-opacity-10 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed";

        const variants = {
            cyan: "border-neon-cyan text-neon-cyan hover:bg-neon-cyan",
            magenta: "border-neon-magenta text-neon-magenta hover:bg-neon-magenta",
            green: "border-neon-green text-neon-green hover:bg-neon-green",
        };

        const glows = {
            cyan: "shadow-[0_0_10px_rgba(0,240,255,0.5),inset_0_0_5px_rgba(0,240,255,0.2)] hover:shadow-[0_0_20px_rgba(0,240,255,0.8),inset_0_0_10px_rgba(0,240,255,0.4)]",
            magenta:
                "shadow-[0_0_10px_rgba(255,0,60,0.5),inset_0_0_5px_rgba(255,0,60,0.2)] hover:shadow-[0_0_20px_rgba(255,0,60,0.8),inset_0_0_10px_rgba(255,0,60,0.4)]",
            green:
                "shadow-[0_0_10px_rgba(0,255,157,0.5),inset_0_0_5px_rgba(0,255,157,0.2)] hover:shadow-[0_0_20px_rgba(0,255,157,0.8),inset_0_0_10px_rgba(0,255,157,0.4)]",
        };

        return (
            <button
                ref={ref}
                className={cn(baseStyles, variants[variant], glow && glows[variant], className)}
                {...props}
            >
                {children}
            </button>
        );
    }
);
NeonButton.displayName = "NeonButton";
