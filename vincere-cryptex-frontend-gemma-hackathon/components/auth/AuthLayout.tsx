import Image from "next/image";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { AccentTone } from "@/components/ui/GlowCard";

type AuthLayoutProps = {
  tone: AccentTone;
  children: ReactNode;
  visual?: ReactNode;
  centered?: boolean;
  backgroundImage?: string;
  decorations?: ReactNode;
  className?: string;
};

export function AuthLayout({
  tone,
  children,
  visual,
  centered = false,
  backgroundImage,
  decorations,
  className,
}: AuthLayoutProps) {
  const isSplit = Boolean(visual) && !centered;

  return (
    <section
      data-tone={tone}
      className={cn(
        "relative flex flex-1 overflow-hidden",
        isSplit ? "flex-col md:flex-row" : "items-center justify-center px-4 py-8 sm:px-6 lg:px-8",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 tactical-grid opacity-[0.26]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_24%,rgba(255,255,255,0.05),transparent_20%),radial-gradient(circle_at_50%_50%,rgba(0,240,255,0.08),transparent_36%),radial-gradient(circle_at_85%_15%,rgba(168,85,247,0.08),transparent_25%)]" />

      {backgroundImage ? (
        <div className="pointer-events-none absolute inset-0 opacity-[0.12] mix-blend-screen">
          <Image
            src={backgroundImage}
            alt=""
            fill
            priority
            className="object-cover"
            sizes="100vw"
          />
        </div>
      ) : null}

      {decorations}

      {isSplit ? (
        <>
          {visual}
          <div className="relative flex w-full flex-1 items-center justify-center px-6 py-8 sm:px-8 md:w-1/2 md:px-12 lg:px-16">
            <div className="pointer-events-none absolute -right-20 top-6 h-64 w-64 rounded-full bg-white/[0.02] blur-[90px]" />
            <div className="pointer-events-none absolute -bottom-20 left-0 h-72 w-72 rounded-full bg-[rgb(var(--accent-rgb)/0.12)] blur-[110px]" />
            <div className="relative z-10 w-full max-w-[34rem]">{children}</div>
          </div>
        </>
      ) : (
        <div className="relative z-10 flex w-full max-w-xl items-center justify-center py-8">{children}</div>
      )}
    </section>
  );
}
