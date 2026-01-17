import { cn } from "@/lib/utils";
import React from "react";
import { Loader2 } from "lucide-react";

// --- PRO BUTTON ---
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: "primary" | "secondary" | "danger" | "ghost";
    size?: "sm" | "md" | "lg" | "icon";
    isLoading?: boolean;
}

export const ProButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = "primary", size = "md", isLoading, children, ...props }, ref) => {
        const baseStyles = "inline-flex items-center justify-center rounded-full font-medium transition-all active:scale-95 disabled:pointer-events-none disabled:opacity-50";

        const variants = {
            primary: "bg-pro-blue text-white shadow-[0_0_20px_rgba(41,151,255,0.3)] hover:bg-pro-blue/90",
            secondary: "bg-white/10 text-white hover:bg-white/20 backdrop-blur-md",
            danger: "bg-pro-red text-white hover:bg-pro-red/90",
            ghost: "hover:bg-white/5 text-muted-foreground hover:text-white",
        };

        const sizes = {
            sm: "h-8 px-4 text-xs",
            md: "h-12 px-6 text-sm",
            lg: "h-14 px-8 text-base font-bold",
            icon: "h-10 w-10",
        };

        return (
            <button
                ref={ref}
                className={cn(baseStyles, variants[variant], sizes[size], className)}
                disabled={props.disabled || isLoading}
                {...props}
            >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {children}
            </button>
        );
    }
);
ProButton.displayName = "ProButton";

// --- PRO CARD ---
export function ProCard({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div className={cn("rounded-3xl glass-pro p-6 text-white", className)} {...props}>
            {children}
        </div>
    );
}

// --- PRO BADGE ---
export function ProBadge({ className, variant = "default", ...props }: React.HTMLAttributes<HTMLDivElement> & { variant?: "default" | "success" | "danger" }) {
    const variants = {
        default: "bg-white/10 text-white",
        success: "bg-pro-green/20 text-pro-green",
        danger: "bg-pro-red/20 text-pro-red",
    };
    return (
        <div className={cn("inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider", variants[variant], className)} {...props} />
    );
}
