"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { CourseVisual } from "@/components/courses/CourseVisual";
import { EnrollmentButton } from "@/components/courses/EnrollmentButton";
import { useCourseProgress } from "@/components/courses/course-state";
import { useCardTilt } from "@/components/courses/use-card-tilt";
import { ArrowRightIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { courseVisualPresets, levelLabels } from "@/lib/courses/catalog-data";
import { getCourseImagePath } from "@/lib/courses/course-images";
import { getCourseRouteId } from "@/lib/courses/routing";
import type { CourseDifficulty, CourseSummary } from "@/lib/courses/types";

type CourseCardProps = {
  course: CourseSummary;
  reason?: string;
  compact?: boolean;
  showStudentControls?: boolean;
};

const difficultyClasses: Record<CourseDifficulty, string> = {
  beginner: "border-[#00FF88]/20 bg-[#00FF88]/5 text-[#00FF88]",
  intermediate: "border-secondary/24 bg-secondary/[0.06] text-secondary",
  advanced: "border-tertiary/24 bg-tertiary/[0.06] text-tertiary",
};

function formatDuration(minutes: number) {
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

export function CourseCard({
  course,
  reason,
  compact = false,
  showStudentControls = false,
}: CourseCardProps) {
  const routeCourseId = getCourseRouteId(course);
  const courseHref = `/courses/${routeCourseId}`;
  const { progress } = useCourseProgress(course.id, course.lessonIds, course);
  const reduceMotion = useReducedMotion();
  const { ref, tiltHandlers } = useCardTilt<HTMLElement>();
  const visualPreset = courseVisualPresets[course.id] ?? {
    tone: course.tone,
    signal: "defense" as const,
  };
  const cardTone = visualPreset.tone;
  const imageSrc = getCourseImagePath(course);

  return (
    <article ref={ref} {...tiltHandlers} className="catalog-tilt-card h-full">
      <div data-tone={cardTone} className="catalog-course-card flex h-full flex-col">
        <Link href={courseHref} className="group/visual block focus:outline-none">
          <CourseVisual
            tone={visualPreset.tone}
            signal={visualPreset.signal}
            imageSrc={imageSrc}
            imageAlt={`${course.title} course visual`}
            className={compact ? "h-44" : "h-52"}
          />
        </Link>

        <div className="catalog-card-content relative z-10 flex flex-1 flex-col gap-5 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="border border-white/10 bg-surface-lowest/70 px-3 py-1 font-label text-[0.64rem] uppercase text-foreground/58">
              {course.category}
            </span>
            <span
              className={cn(
                "border px-3 py-1 font-label text-[0.64rem] uppercase",
                difficultyClasses[course.difficulty],
              )}
            >
              {levelLabels[course.difficulty]}
            </span>
          </div>

          <div className="space-y-3">
            <Link href={courseHref} className="group/title block focus:outline-none">
              <h3 className="font-display text-xl font-semibold text-white transition-colors group-hover/title:text-primary">
                {course.title}
              </h3>
            </Link>
            <p className="text-sm leading-6 text-foreground/64">{course.shortDescription}</p>
            {reason ? (
              <p className="font-label text-[0.68rem] uppercase text-secondary/76">{reason}</p>
            ) : null}
          </div>

          <div className="mt-auto space-y-4">
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div className="bg-white/[0.025] px-3 py-3">
                <span className="block font-label text-[0.58rem] uppercase text-foreground/34">
                  Modules
                </span>
                <span className="mt-1 block text-white">{course.sectionCount}</span>
              </div>
              <div className="bg-white/[0.025] px-3 py-3">
                <span className="block font-label text-[0.58rem] uppercase text-foreground/34">
                  Lessons
                </span>
                <span className="mt-1 block text-white">{course.lessonCount}</span>
              </div>
              <div className="bg-white/[0.025] px-3 py-3">
                <span className="block font-label text-[0.58rem] uppercase text-foreground/34">
                  Time
                </span>
                <span className="mt-1 block text-white">{formatDuration(course.durationMinutes)}</span>
              </div>
            </div>

            {showStudentControls ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-label text-[0.62rem] uppercase text-foreground/42">
                    {progress.isEnrolled ? "Course Progress" : "Open Seat"}
                  </span>
                  <span className="font-label text-[0.62rem] uppercase text-foreground/52">
                    {progress.isEnrolled ? `${progress.progressPercent}%` : "Enroll"}
                  </span>
                </div>
                <div className="h-1.5 bg-surface-lowest">
                  <motion.div
                    className={cn(
                      "h-full",
                      progress.progressPercent === 100
                        ? "bg-[#00FF88] shadow-[0_0_16px_rgba(0,255,136,0.42)]"
                        : "bg-primary shadow-[0_0_16px_rgba(0,240,255,0.42)]",
                    )}
                    initial={{ width: reduceMotion ? `${progress.progressPercent}%` : "0%" }}
                    animate={{ width: `${progress.progressPercent}%` }}
                    transition={{ duration: reduceMotion ? 0 : 0.75, ease: "easeOut" }}
                  />
                </div>
              </div>
            ) : (
              <div className="border border-white/8 bg-white/[0.025] px-3 py-3">
                <span className="block font-label text-[0.58rem] uppercase text-foreground/34">
                  Preview
                </span>
                <span className="mt-1 block text-sm leading-6 text-foreground/62">
                  Sign in as a student to enroll and track progress.
                </span>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
              <EnrollmentButton
                courseId={routeCourseId}
                routeCourseId={routeCourseId}
                lessonIds={course.lessonIds}
                source={course}
                tone={cardTone}
                className="min-h-11 px-4 py-3 text-[0.68rem]"
              />
              <Link
                href={courseHref}
                className="catalog-detail-link inline-flex min-h-11 items-center justify-center gap-2 px-4 py-3 font-label text-[0.68rem] uppercase text-foreground/62 hover:text-primary"
              >
                Details
                <ArrowRightIcon className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
