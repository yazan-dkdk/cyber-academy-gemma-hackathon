"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import type { CourseSummary, CourseTone } from "@/lib/courses/types";
import {
  enrollmentNoLessonRouteMessage,
  type CourseProgressLessonInput,
  getSafeEnrollmentLessonHref,
  logMissingSafeLessonRoute,
  logEnrollmentError,
  useCourseProgress,
} from "@/components/courses/course-state";
import { isStudentUser } from "@/lib/auth-roles";
import { cn } from "@/lib/cn";
import { ArrowRightIcon, PlusIcon } from "@/components/ui/icons";
import { getCourseRouteId } from "@/lib/courses/routing";

type EnrollmentButtonProps = {
  courseId?: string | null;
  routeCourseId: string;
  lessonIds: string[];
  lessonRouteInputs?: CourseProgressLessonInput[];
  source?: CourseSummary | unknown;
  tone?: CourseTone;
  className?: string;
};

function getCourseSource(source: EnrollmentButtonProps["source"]) {
  return source && typeof source === "object" ? (source as Partial<CourseSummary>) : null;
}

export function EnrollmentButton({
  courseId,
  routeCourseId,
  lessonIds,
  lessonRouteInputs,
  source,
  tone = "cyan",
  className,
}: EnrollmentButtonProps) {
  const router = useRouter();
  const { status, user } = useAuthSession();
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [enrollmentError, setEnrollmentError] = useState<string | null>(null);
  const isStudent = status === "authenticated" && isStudentUser(user);
  const progressLessonInputs = lessonRouteInputs ?? lessonIds;
  const sourceCourse = getCourseSource(source);
  const routeId = sourceCourse?.id ? getCourseRouteId(sourceCourse as CourseSummary) : routeCourseId;
  const apiCourseId = courseId?.trim() || routeId;
  const { enrollCourse, progress } = useCourseProgress(routeCourseId, progressLessonInputs, source, apiCourseId);
  const unavailableReason = !isStudent
    ? "guest"
    : sourceCourse?.isPublished === false
      ? "course_not_published"
      : sourceCourse?.isVisible === false
        ? "course_not_visible"
        : null;
  const isEnrollmentAvailable = isStudent && !unavailableReason;
  const targetLessonId = progress.nextLessonId ?? progress.currentLessonId;
  const safeContinueHref =
    progress.isCompleted || !targetLessonId
      ? null
      : getSafeEnrollmentLessonHref(routeId, null, targetLessonId, progressLessonInputs, source);
  const continueHref =
    safeContinueHref ?? `/courses/${routeId}`;

  useEffect(() => {
    if (
      process.env.NODE_ENV !== "development" ||
      !isStudent ||
      !unavailableReason ||
      progress.isEnrolled
    ) {
      return;
    }

    console.warn("Course enrollment marked unavailable", {
      slug: sourceCourse?.slug ?? routeId,
      backendId: apiCourseId,
      source: sourceCourse?.source ?? "unknown",
      enrollmentStatus: sourceCourse?.enrollmentStatus ?? null,
      reason: unavailableReason,
    });
  }, [
    apiCourseId,
    isStudent,
    progress.isEnrolled,
    routeId,
    sourceCourse?.enrollmentStatus,
    sourceCourse?.slug,
    sourceCourse?.source,
    unavailableReason,
  ]);

  async function handleEnroll() {
    setEnrollmentError(null);

    if (!isEnrollmentAvailable) {
      setEnrollmentError("Enrollment is unavailable until this course syncs with the backend.");
      return;
    }

    setIsEnrolling(true);

    try {
      const payload = await enrollCourse();
      const lessonHref = getSafeEnrollmentLessonHref(
        routeId,
        payload,
        targetLessonId ?? lessonIds[0] ?? null,
        progressLessonInputs,
        source,
      );

      if (!lessonHref) {
        logMissingSafeLessonRoute({
          courseSlug: routeId,
          backendId: apiCourseId,
          enrollmentStatus: sourceCourse?.enrollmentStatus ?? null,
          lessonInputs: progressLessonInputs,
          payload,
          source,
        });
        setEnrollmentError(enrollmentNoLessonRouteMessage);
        router.push(`/courses/${routeId}`);
        return;
      }

      router.push(lessonHref);
    } catch (error) {
      logEnrollmentError(error);
      setEnrollmentError("Enrollment could not be completed. Please try again.");
    } finally {
      setIsEnrolling(false);
    }
  }

  if (!isStudent) {
    return (
      <Link href="/login" data-tone={tone} className={cn("primary-button catalog-action", className)}>
        <span className="primary-button__sweep" />
        <span className="relative z-10 inline-flex items-center justify-center gap-2">
          Sign In to Enroll
          <ArrowRightIcon className="h-4 w-4" />
        </span>
      </Link>
    );
  }

  if (progress.isEnrolled) {
    return (
      <Link href={continueHref} data-tone={tone} className={cn("primary-button catalog-action", className)}>
        <span className="primary-button__sweep" />
        <span className="relative z-10 inline-flex items-center justify-center gap-2">
          {progress.isCompleted ? "Review Course" : "Continue Learning"}
          <ArrowRightIcon className="h-4 w-4" />
        </span>
      </Link>
    );
  }

  return (
    <div className="space-y-2">
      <PrimaryButton
        tone={tone}
        type="button"
        loading={isEnrolling}
        disabled={!isEnrollmentAvailable}
        onClick={() => void handleEnroll()}
        className={cn("catalog-action", className)}
      >
        <span className="inline-flex items-center justify-center gap-2">
          {isEnrollmentAvailable ? "Enroll Securely" : "Enrollment Unavailable"}
          <PlusIcon className="h-4 w-4" />
        </span>
      </PrimaryButton>
      {enrollmentError || !isEnrollmentAvailable ? (
        <p className="text-sm leading-6 text-tertiary/72">
          {enrollmentError ?? "Course sync required before enrollment."}
        </p>
      ) : null}
    </div>
  );
}
