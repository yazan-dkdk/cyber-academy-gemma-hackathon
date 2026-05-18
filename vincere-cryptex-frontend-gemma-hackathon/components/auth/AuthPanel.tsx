import type { ReactNode } from "react";
import { GlowCard } from "@/components/ui/GlowCard";
import { cn } from "@/lib/cn";
import type { AccentTone } from "@/components/ui/GlowCard";

type AuthPanelProps = {
  tone: AccentTone;
  title: string;
  description?: string;
  descriptionStyle?: "body" | "label";
  eyebrow?: string;
  children: ReactNode;
  metadata?: ReactNode;
  className?: string;
};

export function AuthPanel({
  tone,
  title,
  description,
  descriptionStyle = "body",
  eyebrow,
  children,
  metadata,
  className,
}: AuthPanelProps) {
  return (
    <div className={cn("relative w-full", className)}>
      <div className="pointer-events-none absolute -right-14 -top-14 h-48 w-48 rounded-full bg-[rgb(var(--accent-rgb)/0.16)] blur-[92px]" />
      <GlowCard tone={tone} className="px-8 py-10 sm:px-10 sm:py-12 md:px-12">
        <div className="relative z-10">
          <div className="mb-10">
            {eyebrow ? (
              <p className="mb-2 font-label text-[0.72rem] font-bold uppercase tracking-[0.34em] text-[rgb(var(--accent-rgb)/0.98)] [text-shadow:0_0_16px_rgb(var(--accent-rgb)/0.36)]">
                {eyebrow}
              </p>
            ) : null}
            <h1 className="max-w-[26rem] font-display text-[2.05rem] font-bold tracking-[-0.05em] text-white sm:text-[2.35rem]">
              {title}
            </h1>
            {description ? (
              <p
                className={cn(
                  "mt-3 max-w-[24rem] text-foreground/62",
                  descriptionStyle === "label"
                    ? "font-label text-[0.72rem] uppercase tracking-[0.24em]"
                    : "text-sm leading-7 sm:text-[0.98rem]",
                )}
              >
                {description}
              </p>
            ) : null}
          </div>

          {children}
        </div>
      </GlowCard>
      {metadata}
    </div>
  );
}
