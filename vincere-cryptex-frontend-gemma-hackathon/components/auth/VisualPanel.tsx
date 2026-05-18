import Image from "next/image";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { AccentTone } from "@/components/ui/GlowCard";

type VisualPanelProps = {
  tone: AccentTone;
  imageSrc: string;
  imageAlt: string;
  title: ReactNode;
  description: string;
  accentVariant?: "bar" | "frame";
  imageClassName?: string;
};

export function VisualPanel({
  tone,
  imageSrc,
  imageAlt,
  title,
  description,
  accentVariant = "frame",
  imageClassName,
}: VisualPanelProps) {
  return (
    <aside
      data-tone={tone}
      className="visual-panel group relative hidden min-h-full w-full md:flex md:w-1/2"
    >
      <div className="pointer-events-none absolute inset-0 tactical-grid opacity-[0.26]" />
      <div className="visual-panel__glow" />

      <Image
        src={imageSrc}
        alt={imageAlt}
        fill
        priority
        className={cn("visual-panel__image object-cover", imageClassName)}
        sizes="(max-width: 768px) 100vw, 50vw"
      />

      <div className="visual-panel__overlay" />

      <div className="relative z-10 flex h-full w-full items-end px-8 py-10 sm:px-10 md:px-12 md:py-12 lg:px-16 lg:py-16">
        <div className="max-w-xl">
          <div className="font-display text-5xl font-bold uppercase leading-[0.96] tracking-[-0.07em] sm:text-6xl">
            {title}
          </div>
          <p className="mt-6 max-w-lg text-lg leading-9 text-foreground/82">{description}</p>
        </div>
      </div>

      {accentVariant === "bar" ? (
        <div className="pointer-events-none absolute left-12 top-12 h-1 w-24 bg-[rgb(var(--accent-rgb)/0.9)] shadow-[0_0_18px_rgb(var(--accent-rgb)/0.42)]" />
      ) : (
        <>
          <div className="pointer-events-none absolute left-8 top-8 h-12 w-12 border-l-2 border-t-2 border-[rgb(var(--accent-rgb)/0.55)] shadow-[0_0_18px_rgb(var(--accent-rgb)/0.24)]" />
          <div className="pointer-events-none absolute bottom-8 right-8 h-12 w-12 border-b-2 border-r-2 border-[rgb(var(--accent-rgb)/0.55)] shadow-[0_0_18px_rgb(var(--accent-rgb)/0.24)]" />
        </>
      )}
    </aside>
  );
}
