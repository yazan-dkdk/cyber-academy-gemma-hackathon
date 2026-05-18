import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type AccentTone = "purple" | "pink" | "cyan" | "neutral";

type GlowCardProps = {
  children: ReactNode;
  tone?: AccentTone;
  corners?: boolean;
  className?: string;
};

export function GlowCard({
  children,
  tone = "neutral",
  corners = true,
  className,
}: GlowCardProps) {
  return (
    <div data-tone={tone} className={cn("glow-card", className)}>
      {corners ? (
        <>
          <span className="corner-accent corner-accent--tl" />
          <span className="corner-accent corner-accent--br" />
        </>
      ) : null}
      {children}
    </div>
  );
}
