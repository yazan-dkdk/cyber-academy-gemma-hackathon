"use client";

import Link from "next/link";
import { useCardTilt } from "@/components/courses/use-card-tilt";
import { ArrowRightIcon, ShieldLockIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import type { LearningPath } from "@/lib/courses/catalog-data";

type LearningPathCardProps = {
  path: LearningPath;
};

export function LearningPathCard({ path }: LearningPathCardProps) {
  const { ref, tiltHandlers } = useCardTilt<HTMLElement>();

  return (
    <article ref={ref} {...tiltHandlers} className="catalog-tilt-card h-full">
      <div
        data-path-tone={path.tone}
        className={cn(
          "catalog-path-card flex h-full min-h-[19rem] flex-col justify-between p-6 sm:p-8",
          path.tone === "red" ? "catalog-path-card--red" : "catalog-path-card--blue",
        )}
      >
        <div className="relative z-10 flex items-start justify-between gap-4">
          <span className="border border-white/12 bg-surface-lowest/50 px-3 py-2 font-label text-[0.68rem] uppercase text-foreground/72">
            {path.label}
          </span>
          <span className="font-label text-[0.68rem] uppercase text-foreground/72">
            {path.moduleCount} Modules
          </span>
        </div>

        <div className="relative z-10 max-w-xl space-y-5">
          <ShieldLockIcon className="h-9 w-9 opacity-70" />
          <div className="space-y-3">
            <h3 className="font-display text-3xl font-semibold uppercase text-white sm:text-4xl">
              {path.title}
            </h3>
            <p className="text-sm leading-7 text-foreground/68">{path.description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="bg-white/[0.035] px-3 py-2 font-label text-[0.68rem] uppercase text-foreground/58">
              {path.courseCount} Courses
            </span>
            <span className="bg-white/[0.035] px-3 py-2 font-label text-[0.68rem] uppercase text-foreground/58">
              Preview Path
            </span>
          </div>
        </div>

        <Link
          href={`/courses/${path.entryCourseId}`}
          className="catalog-path-cta relative z-10 inline-flex min-h-12 w-fit items-center justify-center gap-3 px-6 py-3 font-label text-[0.72rem] uppercase"
        >
          Start Path
          <ArrowRightIcon className="h-4 w-4" />
        </Link>
      </div>
    </article>
  );
}
