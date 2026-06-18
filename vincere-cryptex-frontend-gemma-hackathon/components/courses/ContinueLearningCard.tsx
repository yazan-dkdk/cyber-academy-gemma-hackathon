"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { CourseVisual } from "@/components/courses/CourseVisual";
import { getSafeEnrollmentLessonHref, useCourseProgress } from "@/components/courses/course-state";
import { useCardTilt } from "@/components/courses/use-card-tilt";
import { ArrowRightIcon } from "@/components/ui/icons";
import { courseVisualPresets } from "@/lib/courses/catalog-data";
import { getCourseImagePath } from "@/lib/courses/course-images";
import { getCourseRouteId } from "@/lib/courses/routing";
import type { CourseSummary } from "@/lib/courses/types";

type ContinueLearningCardProps = {
  course: CourseSummary;
};

export function ContinueLearningCard({ course }: ContinueLearningCardProps) {
  const { progress } = useCourseProgress(course.id, course.lessonIds, course);
  const reduceMotion = useReducedMotion();
  const { ref, tiltHandlers } = useCardTilt<HTMLElement>();
  const visualPreset = courseVisualPresets[course.id] ?? {
    tone: course.tone,
    signal: "defense" as const,
  };
  const cardTone = visualPreset.tone;
  const imageSrc = getCourseImagePath(course);
  const routeCourseId = getCourseRouteId(course);
  const targetLessonId = progress.nextLessonId ?? progress.currentLessonId;
  const isCompleted = progress.isCompleted;
  const safeContinueHref =
    isCompleted || !targetLessonId
      ? null
      : getSafeEnrollmentLessonHref(routeCourseId, null, targetLessonId, course.lessonIds, course);
  const continueHref =
    safeContinueHref ?? `/courses/${routeCourseId}`;

  if (!progress.isEnrolled) {
    return null;
  }

  return (
    <article ref={ref} {...tiltHandlers} className="catalog-tilt-card catalog-tilt-card--continue h-full">
      <div data-tone={cardTone} className="catalog-continue-card">
        <CourseVisual
          tone={visualPreset.tone}
          signal={visualPreset.signal}
          imageSrc={imageSrc}
          imageAlt={`${course.title} course visual`}
          className="min-h-44 sm:min-h-full sm:w-[34%]"
        />

        <div className="catalog-card-content relative z-10 flex flex-1 flex-col justify-between gap-6 p-5 sm:p-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="font-label text-[0.68rem] uppercase text-tertiary">
                {isCompleted ? "Completed" : "In Progress"}
              </span>
              <span className="font-label text-[0.68rem] uppercase text-foreground/58">
                {isCompleted
                  ? `${progress.completedCount}/${progress.totalLessons} Lessons`
                  : `Lesson ${Math.min(progress.completedCount + 1, progress.totalLessons)}/${
                      progress.totalLessons
                    }`}
              </span>
            </div>
            <h3 className="font-display text-2xl font-semibold text-white">{course.title}</h3>
            <p className="max-w-xl text-sm leading-6 text-foreground/58">{course.shortDescription}</p>
          </div>

          <div className="space-y-4">
            <div className="h-1.5 bg-surface-lowest">
              <motion.div
                className="h-full bg-primary shadow-[0_0_18px_rgba(0,240,255,0.56)]"
                initial={{ width: reduceMotion ? `${progress.progressPercent}%` : "0%" }}
                animate={{ width: `${progress.progressPercent}%` }}
                transition={{ duration: reduceMotion ? 0 : 0.8, ease: "easeOut" }}
              />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="font-label text-[0.68rem] uppercase text-foreground/58">
                {progress.progressPercent}% Complete
              </span>
              <Link
                href={continueHref}
                data-tone={cardTone}
                className="catalog-action primary-button w-full px-5 py-3 text-[0.68rem] sm:w-auto"
              >
                <span className="primary-button__sweep" />
                <span className="relative z-10 inline-flex items-center justify-center gap-2">
                  {isCompleted ? "Review Course" : "Continue Learning"}
                  <ArrowRightIcon className="h-4 w-4" />
                </span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
