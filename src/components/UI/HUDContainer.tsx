import { cn } from "@/lib/utils";
import React from "react";

interface HUDContainerProps extends React.HTMLAttributes<HTMLDivElement> {
    title?: string;
}

export function HUDContainer({ children, className, title, ...props }: HUDContainerProps) {
    return (
        <div
            className={cn(
                "relative p-4 border border-neon-cyan/30 bg-iron-card/80 backdrop-blur-md rounded-lg",
                "before:absolute before:top-0 before:left-0 before:w-2 before:h-2 before:border-t-2 before:border-l-2 before:border-neon-cyan",
                "after:absolute after:bottom-0 after:right-0 after:w-2 after:h-2 after:border-b-2 after:border-r-2 after:border-neon-cyan",
                className
            )}
            {...props}
        >
            {title && (
                <div className="absolute -top-3 left-4 bg-iron-dark px-2 text-neon-cyan text-xs font-bold tracking-wider uppercase border border-neon-cyan/30">
                    {title}
                </div>
            )}
            {children}
        </div>
    );
}
