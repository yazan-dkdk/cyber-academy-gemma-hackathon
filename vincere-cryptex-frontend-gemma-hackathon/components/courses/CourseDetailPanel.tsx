"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { CourseVisual } from "@/components/courses/CourseVisual";
import { LessonTypeBadge } from "@/components/courses/LessonTypeBadge";
import {
  enrollmentNoLessonRouteMessage,
  type CourseProgressLessonInput,
  getSafeEnrollmentLessonHref,
  getSafeLessonHref,
  logMissingSafeLessonRoute,
  logEnrollmentError,
  useCourseProgress,
  useStudentCourse,
} from "@/components/courses/course-state";
import { useCardTilt } from "@/components/courses/use-card-tilt";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import {
  ArrowRightIcon,
  CheckIcon,
  ChevronDownIcon,
  LockIcon,
  PlayVideoIcon,
  ShieldLockIcon,
} from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { courseVisualPresets } from "@/lib/courses/catalog-data";
import { getCourseImagePath } from "@/lib/courses/course-images";
import type { Course, CourseDifficulty, CourseLesson, CourseSection, LessonType } from "@/lib/courses/types";
import {
  findLessonReference,
  getDurationMinutes,
  getOrderedLessonReferences,
  getOrderedSections,
} from "@/lib/courses/structure";
import { isStudentUser } from "@/lib/auth-roles";
import { getCourseRouteId, lessonMatchesIdentifier } from "@/lib/courses/routing";

type CourseDetailPanelProps = {
  course: Course;
};

type LessonViewState = "COMPLETED" | "CURRENT" | "LOCKED" | "AVAILABLE";

const difficultyLabels: Record<CourseDifficulty, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

function normalizeLessonRouteValue(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? null;
}

function getRouteSafeLessonValue(value: string | null | undefined) {
  const trimmedValue = value?.trim();
  const normalizedValue = normalizeLessonRouteValue(trimmedValue);

  if (
    !trimmedValue ||
    !normalizedValue ||
    normalizedValue.startsWith("legacy-") ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(normalizedValue)
  ) {
    return null;
  }

  return trimmedValue;
}

function getBrowserLessonSlug(lesson: Pick<CourseLesson, "id" | "slug"> | null | undefined) {
  return getRouteSafeLessonValue(lesson?.slug) ?? getRouteSafeLessonValue(lesson?.id);
}

function formatDuration(minutes: number) {
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function getLessonMode(lesson: Pick<CourseLesson, "contentMode" | "type">): LessonType {
  return lesson.contentMode ?? lesson.type;
}

function getStoredOpenSections(courseId: string, fallbackSectionIds: string[]) {
  if (typeof window === "undefined") {
    return fallbackSectionIds;
  }

  try {
    const storedValue = window.localStorage.getItem(`vincere-cryptex:course-detail-open:${courseId}`);
    const parsedValue = storedValue ? JSON.parse(storedValue) : null;

    if (!Array.isArray(parsedValue)) {
      return fallbackSectionIds;
    }

    return parsedValue.filter((sectionId): sectionId is string => typeof sectionId === "string");
  } catch {
    return fallbackSectionIds;
  }
}

function writeStoredOpenSections(courseId: string, sectionIds: string[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      `vincere-cryptex:course-detail-open:${courseId}`,
      JSON.stringify(sectionIds),
    );
  } catch {
    // Accordion memory is a convenience and should not block the detail page.
  }
}

type CourseHeroProps = {
  course: Course;
  durationMinutes: number;
  lessonCount: number;
  sectionCount: number;
};

function CourseHero({ course, durationMinutes, lessonCount, sectionCount }: CourseHeroProps) {
  const { ref, tiltHandlers } = useCardTilt<HTMLElement>({
    maxRotateX: 18,
    maxRotateY: 22,
    parallax: 64,
  });
  const visualPreset = courseVisualPresets[course.id] ?? {
    tone: course.tone,
    signal: "defense" as const,
  };

  return (
    <article ref={ref} {...tiltHandlers} data-tone={visualPreset.tone} className="course-detail-hero">
      <CourseVisual
        tone={visualPreset.tone}
        signal={visualPreset.signal}
        imageSrc={getCourseImagePath(course)}
        imageAlt={`${course.title} course visual`}
        className="course-detail-hero__visual"
      />
      <span className="course-detail-hero__sweep" aria-hidden="true" />

      <div className="course-detail-hero__content">
        <div className="flex flex-wrap gap-2">
          <span className="course-detail-chip course-detail-chip--accent">{course.category}</span>
          <span className="course-detail-chip">{difficultyLabels[course.difficulty]}</span>
        </div>

        <div className="max-w-4xl space-y-4">
          <h1 className="font-display text-4xl font-semibold uppercase text-white sm:text-5xl lg:text-6xl">
            {course.title}
          </h1>
          <p className="max-w-3xl text-base leading-8 text-foreground/72">
            {course.fullDescription}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <span className="course-detail-stat">{formatDuration(durationMinutes)}</span>
          <span className="course-detail-stat">{sectionCount} Sections</span>
          <span className="course-detail-stat">{lessonCount} Lessons</span>
          <span className="course-detail-stat">Protected Media</span>
        </div>
      </div>
    </article>
  );
}

type ControlPanelProps = {
  course: Course;
  lessonIds: string[];
  lessonRouteInputs: CourseProgressLessonInput[];
  completedCount: number;
  totalLessons: number;
  progressPercent: number;
  isEnrolled: boolean;
  currentLessonTitle: string;
  continueHref: string;
  enrollCourse: () => Promise<unknown>;
  onCourseRefresh: () => Promise<Course | void> | Course | void;
  apiCourseId?: string | null;
  firstLessonId: string | null;
  isSyncing?: boolean;
  errorMessage?: string | null;
};

function ControlPanel({
  course,
  lessonIds,
  lessonRouteInputs,
  completedCount,
  totalLessons,
  progressPercent,
  isEnrolled,
  currentLessonTitle,
  continueHref,
  enrollCourse,
  onCourseRefresh,
  apiCourseId,
  firstLessonId,
  isSyncing = false,
  errorMessage,
}: ControlPanelProps) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [enrollmentError, setEnrollmentError] = useState<string | null>(null);
  const routeCourseId = getCourseRouteId(course);
  const normalizedApiCourseId = apiCourseId?.trim() || routeCourseId;
  const unavailableReason =
    course.isPublished === false
      ? "course_not_published"
      : course.isVisible === false
        ? "course_not_visible"
        : null;
  const isEnrollmentAvailable = !unavailableReason;
  const progressTone =
    progressPercent === 100 ? "complete" : progressPercent > 0 ? "active" : "idle";

  useEffect(() => {
    if (process.env.NODE_ENV !== "development" || isEnrolled || !unavailableReason) {
      return;
    }

    console.warn("Course enrollment marked unavailable", {
      slug: course.slug ?? routeCourseId,
      backendId: normalizedApiCourseId,
      source: course.source ?? "unknown",
      enrollmentStatus: course.enrollmentStatus ?? null,
      reason: unavailableReason,
    });
  }, [
    course.enrollmentStatus,
    course.slug,
    course.source,
    isEnrolled,
    normalizedApiCourseId,
    routeCourseId,
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
      let refreshedCourse: Course | void;

      try {
        refreshedCourse = await onCourseRefresh();
      } catch {
        refreshedCourse = undefined;
      }

      const lessonHref = getSafeEnrollmentLessonHref(
        routeCourseId,
        refreshedCourse ?? payload,
        firstLessonId,
        lessonRouteInputs,
        refreshedCourse ?? course,
      );

      if (!lessonHref) {
        logMissingSafeLessonRoute({
          courseSlug: routeCourseId,
          backendId: normalizedApiCourseId,
          enrollmentStatus: course.enrollmentStatus ?? null,
          lessonInputs: lessonRouteInputs,
          payload: refreshedCourse ?? payload,
          source: refreshedCourse ?? course,
        });
        setEnrollmentError(enrollmentNoLessonRouteMessage);
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

  return (
    <aside data-tone={course.tone} data-progress-tone={progressTone} className="course-control-panel">
      <div className="relative z-10 space-y-7">
        <div className="flex items-center justify-between gap-4">
          <p className="font-label text-[0.72rem] uppercase text-foreground/62">
            Enrollment Status
          </p>
          <span
            className={cn(
              "course-status-pill",
              isEnrolled ? "course-status-pill--active" : "course-status-pill--idle",
            )}
          >
            {isEnrolled ? "Active" : "Inactive"}
          </span>
        </div>

        <div className="space-y-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="font-label text-[0.72rem] uppercase text-foreground/54">
                Overall Progress
              </p>
              <p className="mt-2 text-sm text-foreground/48">
                Synced from your student course record.
              </p>
            </div>
            <span className="font-display text-4xl font-semibold text-white">
              {progressPercent}%
            </span>
          </div>
          <div className="course-control-progress">
            <motion.div
              className="course-control-progress__bar"
              initial={{ width: reduceMotion ? `${progressPercent}%` : "0%" }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: reduceMotion ? 0 : 0.8, ease: "easeOut" }}
            />
          </div>
          <div className="flex items-center justify-between gap-3 font-label text-[0.66rem] uppercase text-foreground/44">
            <span>{completedCount} completed</span>
            <span>{totalLessons} total</span>
          </div>
        </div>

        <div className="course-next-panel">
          <p className="font-label text-[0.68rem] uppercase text-primary/72">
            {progressPercent >= 100 ? "Course Completed" : isEnrolled ? "Up Next" : "Enrollment Required"}
          </p>
          <h2 className="mt-2 font-display text-xl font-semibold text-white">{currentLessonTitle}</h2>
          {!isEnrolled ? (
            <p className="mt-2 text-sm leading-6 text-foreground/58">
              Enroll securely to unlock the first available lesson.
            </p>
          ) : null}
        </div>

        {isEnrolled ? (
          <Link href={continueHref} data-tone={course.tone} className="course-control-button">
            <span>{progressPercent >= 100 ? "Review Course" : "Continue Learning"}</span>
            <ArrowRightIcon className="course-control-button__icon h-4 w-4" />
          </Link>
        ) : (
          <PrimaryButton
            type="button"
            tone={course.tone}
            loading={isEnrolling}
            disabled={!isEnrollmentAvailable}
            onClick={() => void handleEnroll()}
            className="course-control-button"
          >
            <span>{isEnrollmentAvailable ? "Enroll Securely" : "Enrollment Unavailable"}</span>
            <ArrowRightIcon className="course-control-button__icon h-4 w-4" />
          </PrimaryButton>
        )}

        <div className="course-security-note">
          <ShieldLockIcon className="h-5 w-5 text-primary/72" />
          <span>
            Progress and enrollment are loaded from the student backend.
          </span>
        </div>

        {isSyncing ? (
          <p className="text-sm text-foreground/50">Syncing student progress...</p>
        ) : null}

        {errorMessage ? (
          <p className="text-sm text-tertiary/72">{errorMessage}</p>
        ) : null}

        {enrollmentError || (!isEnrolled && !isEnrollmentAvailable) ? (
          <p className="text-sm text-tertiary/72">
            {enrollmentError ?? "Course sync required before enrollment."}
          </p>
        ) : null}
      </div>

      <span className="corner-accent corner-accent--tl" />
      <span className="corner-accent corner-accent--br" />
      <span className="sr-only">Course has {lessonIds.length} lesson identifiers loaded.</span>
    </aside>
  );
}

function CoursePreviewPanel({ course }: { course: Course }) {
  return (
    <aside data-tone={course.tone} className="course-control-panel">
      <div className="relative z-10 space-y-7">
        <div>
          <p className="font-label text-[0.72rem] uppercase text-foreground/62">
            Course Preview
          </p>
          <h2 className="mt-3 font-display text-2xl font-semibold text-white">
            Sign in to start learning.
          </h2>
          <p className="mt-3 text-sm leading-7 text-foreground/62">
            Guests can review the syllabus and course overview. Enrollment, progress, current
            lessons, protected media, and AI Tutor actions require an authenticated student session.
          </p>
        </div>

        <div className="course-security-note">
          <ShieldLockIcon className="h-5 w-5 text-primary/72" />
          <span>Frontend previews are UX only. Backend RBAC remains authoritative.</span>
        </div>

        <Link href="/login" data-tone={course.tone} className="course-control-button">
          <span>Sign In to Enroll</span>
          <ArrowRightIcon className="course-control-button__icon h-4 w-4" />
        </Link>
      </div>

      <span className="corner-accent corner-accent--tl" />
      <span className="corner-accent corner-accent--br" />
    </aside>
  );
}

type LessonRowProps = {
  lesson: CourseLesson;
  lessonHref: string | null;
  state: LessonViewState;
  showStudentControls: boolean;
};

function LessonRow({ lesson, lessonHref, state, showStudentControls }: LessonRowProps) {
  const lessonMode = getLessonMode(lesson);
  const isLocked = showStudentControls && state === "LOCKED";
  const rowClassName = cn(
    "course-lesson-row",
    lessonMode === "VIDEO" || lessonMode === "HYBRID" ? "course-lesson-row--media" : "",
    state === "CURRENT" && (lessonMode === "VIDEO" || lessonMode === "HYBRID") ? "course-lesson-row--current-video" : "",
    state === "COMPLETED" ? "course-lesson-row--completed" : "",
    state === "CURRENT" ? "course-lesson-row--current" : "",
    state === "LOCKED" ? "course-lesson-row--locked" : "",
    state === "AVAILABLE" ? "course-lesson-row--available" : "",
  );
  const icon = state === "COMPLETED" ? (
    <CheckIcon className="h-4 w-4" />
  ) : state === "LOCKED" ? (
    <LockIcon className="h-4 w-4" />
  ) : (
    <span className="course-lesson-row__dot" aria-hidden="true" />
  );
  const content = (
    <>
      <span className="course-lesson-row__icon">{icon}</span>
      <span className="min-w-0">
        <span className="course-lesson-row__title-line">
          <span className="course-lesson-row__title">{lesson.title}</span>
          <LessonTypeBadge type={lessonMode} className="course-lesson-row__type-badge" />
        </span>
        <span className="mt-1 block text-sm leading-6 text-foreground/58">
          {lesson.summary}
        </span>
      </span>
      <span className="course-lesson-row__meta">
        <span>{lesson.durationMinutes}m</span>
        <span>{showStudentControls ? state : "PREVIEW"}</span>
      </span>
      {lessonMode === "VIDEO" || lessonMode === "HYBRID" ? (
        <span className="course-lesson-row__media-mark" aria-hidden="true">
          <PlayVideoIcon className="h-7 w-7" />
        </span>
      ) : null}
    </>
  );

  if (isLocked || !showStudentControls || !lessonHref) {
    return (
      <div data-lesson-type={lessonMode} className={rowClassName}>
        {content}
      </div>
    );
  }

  return (
    <Link href={lessonHref} data-lesson-type={lessonMode} className={rowClassName}>
      {content}
    </Link>
  );
}

type SectionAccordionProps = {
  section: CourseSection;
  sectionIndex: number;
  isOpen: boolean;
  onToggle: () => void;
  getLessonState: (lessonId: string) => LessonViewState;
  getLessonHref: (lesson: CourseLesson) => string | null;
  showStudentControls: boolean;
};

function SectionAccordion({
  section,
  sectionIndex,
  isOpen,
  onToggle,
  getLessonState,
  getLessonHref,
  showStudentControls,
}: SectionAccordionProps) {
  const orderedLessons = [...section.lessons].sort(
    (firstLesson, secondLesson) => firstLesson.order - secondLesson.order,
  );
  const completedCount = orderedLessons.filter((lesson) => getLessonState(lesson.id) === "COMPLETED")
    .length;
  const sectionIsLocked =
    showStudentControls && orderedLessons.every((lesson) => getLessonState(lesson.id) === "LOCKED");
  const sectionHasCurrent =
    showStudentControls && orderedLessons.some((lesson) => getLessonState(lesson.id) === "CURRENT");
  const sectionStatus = !showStudentControls
    ? "PREVIEW"
    : completedCount === orderedLessons.length
      ? "COMPLETED"
      : sectionIsLocked
        ? "LOCKED"
        : sectionHasCurrent
          ? "IN PROGRESS"
          : "AVAILABLE";

  return (
    <article
      className={cn(
        "course-section-card",
        isOpen ? "course-section-card--open" : "",
        sectionHasCurrent ? "course-section-card--current" : "",
      )}
    >
      <button type="button" className="course-section-card__header" onClick={onToggle}>
        <span className="course-section-card__status">
          {sectionStatus === "COMPLETED" ? (
            <CheckIcon className="h-5 w-5" />
          ) : sectionStatus === "LOCKED" ? (
            <LockIcon className="h-5 w-5" />
          ) : (
            <span className="course-section-card__pulse" aria-hidden="true" />
          )}
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block font-label text-[0.66rem] uppercase text-foreground/38">
            Section {sectionIndex + 1}
          </span>
          <span className="mt-2 block font-display text-2xl font-semibold text-white">
            {section.title}
          </span>
          <span className="mt-2 block max-w-3xl text-sm leading-7 text-foreground/60">
            {section.description}
          </span>
        </span>
        <span className="course-section-card__aside">
          <span>
            {showStudentControls ? `${completedCount}/${orderedLessons.length}` : `${orderedLessons.length} lessons`}
          </span>
          <span>{sectionStatus}</span>
          <ChevronDownIcon className={cn("h-5 w-5", isOpen ? "rotate-180" : "")} />
        </span>
      </button>

      <AnimatePresence initial={false}>
        {isOpen ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="grid gap-3 px-4 pb-5 sm:px-6">
              {orderedLessons.map((lesson) => (
                <LessonRow
                  key={lesson.id}
                  lesson={lesson}
                  lessonHref={getLessonHref(lesson)}
                  state={showStudentControls ? getLessonState(lesson.id) : "AVAILABLE"}
                  showStudentControls={showStudentControls}
                />
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </article>
  );
}

export function CourseDetailPanel({ course }: CourseDetailPanelProps) {
  const { status, user } = useAuthSession();
  const showStudentControls = status === "authenticated" && isStudentUser(user);
  const {
    course: studentCourse,
    errorMessage: studentCourseErrorMessage,
    isLoading: studentCourseLoading,
    refresh: refreshStudentCourse,
  } = useStudentCourse(course.id, course, showStudentControls);
  const activeCourse = showStudentControls ? studentCourse : course;
  const activeCourseRouteId = getCourseRouteId(activeCourse);
  const activeCourseApiId = activeCourseRouteId;
  const reduceMotion = useReducedMotion();
  const orderedSections = useMemo(() => getOrderedSections(activeCourse), [activeCourse]);
  const orderedLessons = useMemo(() => getOrderedLessonReferences(activeCourse), [activeCourse]);
  const fallbackOrderedLessons = useMemo(() => getOrderedLessonReferences(course), [course]);
  const lessonIds = useMemo(
    () => orderedLessons.map((reference) => reference.lesson.id),
    [orderedLessons],
  );
  const lessonProgressInputs = useMemo(
    () =>
      orderedLessons.map((reference) => ({
        id: reference.lesson.id,
        backendId: reference.lesson.backendId,
        slug: reference.lesson.slug,
        isLocked: reference.lesson.isLocked,
        type: getLessonMode(reference.lesson),
      })),
    [orderedLessons],
  );
  const lessonRouteInputs = useMemo(
    () =>
      lessonProgressInputs.map((lessonInput, lessonIndex) => ({
        ...lessonInput,
        slug:
          getRouteSafeLessonValue(lessonInput.slug) ??
          getBrowserLessonSlug(fallbackOrderedLessons[lessonIndex]?.lesson),
      })),
    [fallbackOrderedLessons, lessonProgressInputs],
  );
  const {
    completedLessonSet,
    enrollCourse,
    lockedLessonSet,
    progress,
  } = useCourseProgress(activeCourseRouteId, lessonProgressInputs, activeCourse, activeCourseApiId);
  const durationMinutes = getDurationMinutes(activeCourse);
  const isCourseCompleted = progress.isCompleted;
  const currentProgressLessonId = progress.currentLessonId ?? progress.nextLessonId;
  const currentReference =
    isCourseCompleted
      ? null
      : (currentProgressLessonId ? findLessonReference(activeCourse, currentProgressLessonId) : null) ??
        orderedLessons.find((reference) => !lockedLessonSet.has(reference.lesson.id)) ??
        orderedLessons[0] ??
        null;
  const currentLessonTitle =
    isCourseCompleted
      ? "Course Review"
      : currentReference?.lesson.title ?? "Course Overview";
  const currentLessonId = currentReference?.lesson.id ?? null;
  const safeContinueHref =
    !isCourseCompleted && currentLessonId
      ? getSafeEnrollmentLessonHref(
          activeCourseRouteId,
          null,
          currentLessonId,
          lessonRouteInputs,
          activeCourse,
        )
      : null;
  const continueHref =
    safeContinueHref ?? `/courses/${activeCourseRouteId}`;
  const fallbackOpenSectionIds = useMemo(() => {
    const currentSection = currentReference?.sectionId;

    if (currentSection) {
      return [currentSection];
    }

    return orderedSections[0] ? [orderedSections[0].id] : [];
  }, [currentReference?.sectionId, orderedSections]);
  const [openSectionIds, setOpenSectionIds] = useState<string[]>(() =>
    getStoredOpenSections(activeCourse.id, fallbackOpenSectionIds),
  );

  function toggleSection(sectionId: string) {
    setOpenSectionIds((currentIds) => {
      const nextIds = currentIds.includes(sectionId)
        ? currentIds.filter((currentId) => currentId !== sectionId)
        : [...currentIds, sectionId];

      writeStoredOpenSections(activeCourse.id, nextIds);

      return nextIds;
    });
  }

  function getLessonState(lessonId: string): LessonViewState {
    if (completedLessonSet.has(lessonId)) {
      return "COMPLETED";
    }

    if (lockedLessonSet.has(lessonId)) {
      return "LOCKED";
    }

    if (lessonMatchesIdentifier({ id: lessonId }, progress.currentLessonId ?? progress.nextLessonId)) {
      return "CURRENT";
    }

    return "AVAILABLE";
  }

  function getSyllabusLessonHref(lesson: CourseLesson) {
    return getSafeLessonHref(
      activeCourseRouteId,
      {
        id: lesson.id,
        backendId: lesson.backendId,
        slug: lesson.slug,
        isLocked: lesson.isLocked,
        type: getLessonMode(lesson),
      },
      lessonRouteInputs,
    );
  }

  return (
    <motion.div
      data-tone={activeCourse.tone}
      className="course-detail-page mx-auto flex w-full max-w-[1600px] flex-col gap-9 px-4 py-10 sm:px-6 lg:px-10 lg:py-14"
      initial={reduceMotion ? false : { opacity: 0, y: 20 }}
      animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <Link
        href="/courses"
        className="w-fit font-label text-[0.72rem] uppercase text-foreground/52 hover:text-primary"
      >
        Back to Courses
      </Link>

      <section className="grid gap-8 xl:grid-cols-[1fr_30rem] xl:items-start">
        <CourseHero
          course={activeCourse}
          durationMinutes={durationMinutes}
          lessonCount={progress.totalLessons}
          sectionCount={activeCourse.sections.length}
        />

        {showStudentControls ? (
          <ControlPanel
            course={activeCourse}
            lessonIds={lessonIds}
            lessonRouteInputs={lessonRouteInputs}
            completedCount={progress.completedCount}
            totalLessons={progress.totalLessons}
            progressPercent={progress.progressPercent}
            isEnrolled={progress.isEnrolled}
            currentLessonTitle={currentLessonTitle}
            continueHref={continueHref}
            enrollCourse={enrollCourse}
            onCourseRefresh={refreshStudentCourse}
            apiCourseId={activeCourseApiId}
            firstLessonId={currentLessonId ?? lessonIds[0] ?? null}
            isSyncing={studentCourseLoading}
            errorMessage={studentCourseErrorMessage}
          />
        ) : (
          <CoursePreviewPanel course={activeCourse} />
        )}
      </section>

      <section id="course-lessons" className="grid gap-5 xl:grid-cols-[1fr_30rem] xl:items-start">
        <div className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-label text-[0.72rem] uppercase text-tertiary/72">
                Syllabus Overview
              </p>
              <h2 className="mt-2 font-display text-3xl font-semibold uppercase text-white">
                Curriculum
              </h2>
            </div>
            <span className="font-label text-[0.72rem] uppercase text-foreground/42">
              {showStudentControls
                ? `${progress.completedCount} completed / ${progress.totalLessons} lessons`
                : `${progress.totalLessons} lesson preview`}
            </span>
          </div>

          <div className="grid gap-4">
            {orderedSections.map((section, sectionIndex) => (
              <SectionAccordion
                key={section.id}
                section={section}
                sectionIndex={sectionIndex}
                isOpen={openSectionIds.includes(section.id)}
                onToggle={() => toggleSection(section.id)}
                getLessonState={getLessonState}
                getLessonHref={getSyllabusLessonHref}
                showStudentControls={showStudentControls}
              />
            ))}
          </div>

          <div className="course-security-footnote">
            <ShieldLockIcon className="h-4 w-4" />
            <span>
              {showStudentControls
                ? "Protected media placeholder | backend student progress active"
                : "Course preview only | backend RBAC remains authoritative"}
            </span>
          </div>
        </div>
      </section>
    </motion.div>
  );
}
