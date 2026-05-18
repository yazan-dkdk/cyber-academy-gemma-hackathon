"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { AiTutorPanel } from "@/components/ai-tutor/AiTutorPanel";
import { LessonTypeBadge } from "@/components/courses/LessonTypeBadge";
import {
  buildCourseProgress,
  type CourseProgressLessonInput,
  getSafeEnrollmentLessonHref,
  getSafeLessonHref,
  logEnrollmentError,
  normalizeLessonMode,
  useCourseProgress,
  useStudentLesson,
  type LessonCompletionVerification,
  type MarkLessonCompleteResult,
} from "@/components/courses/course-state";
import { useCardTilt } from "@/components/courses/use-card-tilt";
import { GlowCard } from "@/components/ui/GlowCard";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import {
  ArrowBackIcon,
  ArrowRightIcon,
  CheckIcon,
  LockIcon,
  PlayVideoIcon,
  PlusIcon,
  ShieldLockIcon,
} from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { isStudentUser } from "@/lib/auth-roles";
import { getCourseRouteId } from "@/lib/courses/routing";
import type {
  Course,
  CourseLesson,
  CourseLessonReference,
  LessonProgressValues,
  LessonType,
} from "@/lib/courses/types";
import {
  getLessonNavigation,
  getOrderedLessonReferences,
} from "@/lib/courses/structure";

const TEXT_READING_SECONDS = 10;
const VIDEO_WATCH_THRESHOLD = 82;
const LESSON_PROGRESS_AUTOSAVE_DELAY_MS = 1200;
const MEDIA_PROTECTION_LABEL = "Protected Media | Backend Session";

type LessonPagePanelProps = {
  course: Course;
  lessonId: string;
};

type CompletionRequirement = {
  key: "READING_TIME" | "TEXT_SCROLL_BOTTOM" | "WATCH_THRESHOLD";
  label: string;
  met: boolean;
  detail: string;
};

type MarkLessonComplete = (
  lessonId: string,
  verification: LessonCompletionVerification,
) => Promise<MarkLessonCompleteResult>;

type LessonRuntimeState = "COMPLETED" | "CURRENT" | "LOCKED" | "AVAILABLE";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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

function getLessonMode(lesson: Pick<CourseLesson, "contentMode" | "type">): LessonType {
  return normalizeLessonMode(lesson.contentMode, lesson.type);
}

function hasBackendMetadataValue(value: unknown) {
  if (isRecord(value)) {
    return Object.keys(value).length > 0;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return typeof value === "string" && value.trim().length > 0;
}

function getLessonMediaMetadataSources(lesson: CourseLesson) {
  const mediaVideo = isRecord(lesson.media) ? lesson.media.video : null;
  const sources: string[] = [];

  if (hasBackendMetadataValue(lesson.protectedMedia)) {
    sources.push("protectedMedia");
  }

  if (hasBackendMetadataValue(lesson.video)) {
    sources.push("video");
  }

  if (hasBackendMetadataValue(mediaVideo)) {
    sources.push("media.video");
  }

  if (!sources.length && hasBackendMetadataValue(lesson.media)) {
    sources.push("media");
  }

  return sources;
}

function getProtectedMediaLabel(lesson: CourseLesson) {
  const sources = getLessonMediaMetadataSources(lesson);

  if (!sources.length) {
    return "Backend media metadata pending";
  }

  return "Backend protected media metadata synced";
}

function clampLessonProgressPercent(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
}

function clampLessonReadingSeconds(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function normalizeMeasuredProgress(progress: LessonProgressValues): LessonProgressValues {
  return {
    scroll: clampLessonProgressPercent(progress.scroll),
    watch: clampLessonProgressPercent(progress.watch),
    readingTime: clampLessonReadingSeconds(progress.readingTime),
  };
}

function hasMeaningfulMeasuredProgress(
  progress: LessonProgressValues,
  requiresText: boolean,
  requiresVideo: boolean,
) {
  return (
    (requiresText && (progress.scroll > 0 || progress.readingTime > 0)) ||
    (requiresVideo && progress.watch > 0)
  );
}

function measuredProgressChanged(
  previousProgress: LessonProgressValues,
  nextProgress: LessonProgressValues,
  requiresText: boolean,
  requiresVideo: boolean,
) {
  return (
    (requiresText &&
      (previousProgress.scroll !== nextProgress.scroll ||
        previousProgress.readingTime !== nextProgress.readingTime)) ||
    (requiresVideo && previousProgress.watch !== nextProgress.watch)
  );
}

function isLessonAccessDenied(reason: string) {
  return reason === "http_401" || reason === "http_403" || reason === "accessDenied" || reason === "requiresEnrollment";
}

function AnimatedNumber({
  value,
  suffix = "",
}: {
  value: number;
  suffix?: string;
}) {
  const reduceMotion = useReducedMotion();
  const [displayValue, setDisplayValue] = useState(reduceMotion ? value : 0);
  const previousValueRef = useRef(displayValue);

  useEffect(() => {
    if (reduceMotion) {
      previousValueRef.current = value;
      return;
    }

    let frameId = 0;
    const startValue = previousValueRef.current;
    const delta = value - startValue;
    const startedAt = window.performance.now();
    const duration = 620;
    previousValueRef.current = value;

    function tick(now: number) {
      const progress = Math.min(1, (now - startedAt) / duration);
      const easedProgress = 1 - Math.pow(1 - progress, 3);

      setDisplayValue(Math.round(startValue + delta * easedProgress));

      if (progress < 1) {
        frameId = window.requestAnimationFrame(tick);
      }
    }

    frameId = window.requestAnimationFrame(tick);

    return () => window.cancelAnimationFrame(frameId);
  }, [reduceMotion, value]);

  return (
    <>
      {reduceMotion ? value : displayValue}
      {suffix}
    </>
  );
}

function getLessonHref(
  reference: CourseLessonReference | null,
  lessonRouteInputs: CourseProgressLessonInput[],
) {
  if (!reference) {
    return null;
  }

  return getSafeLessonHref(
    reference.courseId,
    {
      id: reference.lesson.id,
      backendId: reference.lesson.backendId,
      slug: reference.lesson.slug,
      isLocked: reference.lesson.isLocked,
      type: getLessonMode(reference.lesson),
    },
    lessonRouteInputs,
  );
}

function getCourseLessonInputs(course: Course): CourseProgressLessonInput[] {
  return getOrderedLessonReferences(course).map((reference) => ({
    id: reference.lesson.id,
    backendId: reference.lesson.backendId,
    slug: reference.lesson.slug,
    isLocked: reference.lesson.isLocked,
    type: getLessonMode(reference.lesson),
  }));
}

function SignalProgressBar({
  value,
  variant = "cyan",
  className,
}: {
  value: number;
  variant?: "cyan" | "purple" | "pink" | "green";
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const normalizedValue = Math.max(0, Math.min(100, value));

  return (
    <div data-variant={variant} className={cn("lesson-signal-progress", className)}>
      <motion.div
        className="lesson-signal-progress__bar"
        initial={{ width: reduceMotion ? `${normalizedValue}%` : "0%" }}
        animate={{ width: `${normalizedValue}%` }}
        transition={{ duration: reduceMotion ? 0 : 0.62, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}

function getRuntimeState({
  lessonId,
  activeLessonId,
  completedLessonSet,
  lockedLessonSet,
}: {
  lessonId: string;
  activeLessonId: string;
  completedLessonSet: Set<string>;
  lockedLessonSet: Set<string>;
}): LessonRuntimeState {
  if (completedLessonSet.has(lessonId)) {
    return "COMPLETED";
  }

  if (lockedLessonSet.has(lessonId)) {
    return "LOCKED";
  }

  if (lessonId === activeLessonId) {
    return "CURRENT";
  }

  return "AVAILABLE";
}

type LessonStackProps = {
  references: CourseLessonReference[];
  activeLessonId: string;
  completedLessonSet: Set<string>;
  lockedLessonSet: Set<string>;
  lessonRouteInputs: CourseProgressLessonInput[];
};

function LessonStack({
  references,
  activeLessonId,
  completedLessonSet,
  lockedLessonSet,
  lessonRouteInputs,
}: LessonStackProps) {
  return (
    <div className="lesson-stack">
      {references.map((reference) => {
        const state = getRuntimeState({
          lessonId: reference.lesson.id,
          activeLessonId,
          completedLessonSet,
          lockedLessonSet,
        });
        const href = getLessonHref(reference, lessonRouteInputs);
        const isLocked = state === "LOCKED";
        const lessonMode = getLessonMode(reference.lesson);
        const content = (
          <>
            <span className="lesson-stack-item__state">
              {state === "COMPLETED" ? (
                <CheckIcon className="h-4 w-4" />
              ) : state === "LOCKED" ? (
                <LockIcon className="h-4 w-4" />
              ) : state === "CURRENT" ? (
                <PlayVideoIcon className="h-4 w-4" />
              ) : (
                <span className="lesson-stack-item__dot" aria-hidden="true" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="lesson-stack-item__label">
                {String(reference.lessonIndex + 1).padStart(2, "0")}. {reference.lesson.title}
              </span>
              <span className="lesson-stack-item__meta">
                {state}
                <span aria-hidden="true">/</span>
                {reference.lesson.durationMinutes}m
              </span>
            </span>
            <LessonTypeBadge
              type={lessonMode}
              compact
              showProtectedIndicator={false}
              className="lesson-stack-item__type"
            />
          </>
        );
        const className = cn(
          "lesson-stack-item",
          `lesson-stack-item--${state.toLowerCase()}`,
          lessonMode === "VIDEO" || lessonMode === "HYBRID"
            ? "lesson-stack-item--media"
            : "",
        );

        if (isLocked || !href) {
          return (
            <div key={reference.lesson.id} data-lesson-type={lessonMode} className={className}>
              {content}
            </div>
          );
        }

        return (
          <Link
            key={reference.lesson.id}
            href={href}
            data-lesson-type={lessonMode}
            className={className}
          >
            {content}
          </Link>
        );
      })}
    </div>
  );
}

type LessonSidebarProps = {
  references: CourseLessonReference[];
  activeLessonId: string;
  progressPercent: number;
  completedCount: number;
  totalLessons: number;
  completedLessonSet: Set<string>;
  lockedLessonSet: Set<string>;
  lessonRouteInputs: CourseProgressLessonInput[];
  previousHref: string | null;
  nextHref: string | null;
  isNextLocked: boolean;
};

function LessonSidebar({
  references,
  activeLessonId,
  progressPercent,
  completedCount,
  totalLessons,
  completedLessonSet,
  lockedLessonSet,
  lessonRouteInputs,
  previousHref,
  nextHref,
  isNextLocked,
}: LessonSidebarProps) {
  return (
    <aside className="lesson-sidebar">
      <div className="relative z-10 space-y-6">
        <div>
          <p className="lesson-panel-kicker">Course Progress</p>
          <div className="mt-4 flex items-end justify-between gap-4">
            <span className="font-display text-4xl font-semibold text-white">
              <AnimatedNumber value={progressPercent} suffix="%" />
            </span>
            <span className="pb-1 font-label text-[0.68rem] uppercase text-primary/72">
              <AnimatedNumber value={completedCount} />/{totalLessons}
            </span>
          </div>
          <SignalProgressBar value={progressPercent} variant={progressPercent === 100 ? "green" : "cyan"} className="mt-4" />
        </div>

        <LessonStack
          references={references}
          activeLessonId={activeLessonId}
          completedLessonSet={completedLessonSet}
          lockedLessonSet={lockedLessonSet}
          lessonRouteInputs={lessonRouteInputs}
        />

        <div className="grid grid-cols-2 gap-3">
          {previousHref ? (
            <Link href={previousHref} className="lesson-nav-trigger">
              <ArrowBackIcon className="h-4 w-4" />
              <span>Previous</span>
            </Link>
          ) : (
            <span className="lesson-nav-trigger lesson-nav-trigger--disabled">
              <ArrowBackIcon className="h-4 w-4" />
              <span>Previous</span>
            </span>
          )}

          {nextHref && !isNextLocked ? (
            <Link href={nextHref} className="lesson-nav-trigger">
              <span>Next</span>
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          ) : (
            <span className="lesson-nav-trigger lesson-nav-trigger--disabled">
              <span>Next</span>
              <LockIcon className="h-4 w-4" />
            </span>
          )}
        </div>
      </div>
    </aside>
  );
}

type VideoPlaceholderProps = {
  lessonType: Extract<LessonType, "VIDEO" | "HYBRID">;
  hasMediaMetadata: boolean;
  mediaLabel: string;
  metadataSources: string[];
  progressPercent: number;
  thresholdPercent: number;
  isWatching: boolean;
  onStart: () => void;
};

function VideoPlaceholder({
  lessonType,
  hasMediaMetadata,
  mediaLabel,
  metadataSources,
  progressPercent,
  thresholdPercent,
  isWatching,
  onStart,
}: VideoPlaceholderProps) {
  return (
    <div className="lesson-media-shell lesson-console-content" data-lesson-type={lessonType}>
      <div className="lesson-secure-frame">
        <span className="lesson-secure-frame__grid" aria-hidden="true" />
        <span className="lesson-secure-frame__sweep" aria-hidden="true" />
        <span className="lesson-secure-frame__scanline" aria-hidden="true" />
        <span className="lesson-secure-frame__watermark" aria-hidden="true">
          user@vincere.local
        </span>

        <div className="lesson-secure-frame__header">
          <LessonTypeBadge
            type={lessonType}
            prominent
            protectedLabel={hasMediaMetadata ? MEDIA_PROTECTION_LABEL : "Protected Media | Metadata Pending"}
            className="lesson-secure-frame__badge"
          />
          <span className="lesson-secure-frame__status">
            <span aria-hidden="true" />
            {hasMediaMetadata ? "Protected session ready" : "Awaiting backend media"}
          </span>
        </div>

        <div className="lesson-secure-frame__center">
          <PlayVideoIcon className="h-12 w-12" />
          <div>
            <h2 className="font-display text-2xl font-semibold text-white">
              {hasMediaMetadata ? "Protected media session" : "Media metadata pending"}
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-7 text-foreground/62">
              {hasMediaMetadata
                ? `${mediaLabel}. Watch progress records through the student progress endpoint without exposing media URLs or raw media paths.`
                : "The backend has not attached protected media metadata for this lesson yet."}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {[
                "Protected video session",
                "Watermarked playback",
                "Signed access required",
              ].map((label) => (
                <span
                  key={label}
                  className="border border-primary/24 bg-primary/10 px-3 py-1 font-label text-[0.58rem] uppercase text-primary/82"
                >
                  {label}
                </span>
              ))}
              {metadataSources.length ? (
                <span className="border border-tertiary/24 bg-tertiary/10 px-3 py-1 font-label text-[0.58rem] uppercase text-tertiary/82">
                  Metadata received
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="lesson-secure-frame__controls">
          <button
            type="button"
            onClick={onStart}
            disabled={!hasMediaMetadata || isWatching || progressPercent >= 100}
            className="lesson-play-trigger"
          >
            <PlayVideoIcon className="h-4 w-4" />
            <span>
              {!hasMediaMetadata
                ? "Await Metadata"
                : progressPercent >= thresholdPercent
                ? "Threshold Recorded"
                : isWatching
                  ? "Watching"
                  : "Start Protected Session"}
            </span>
          </button>
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center justify-between gap-3 font-label text-[0.64rem] uppercase text-foreground/48">
              <span>Watch Progress</span>
              <span className="text-primary/86"><AnimatedNumber value={progressPercent} suffix="%" /></span>
            </div>
            <SignalProgressBar value={progressPercent} variant={lessonType === "HYBRID" ? "purple" : "cyan"} />
          </div>
          <span className="lesson-threshold-chip">Unlock {thresholdPercent}%</span>
        </div>
      </div>
    </div>
  );
}

type UnlockedLessonPanelProps = {
  courseTitle: string;
  lesson: CourseLesson;
  previousHref: string | null;
  nextHref: string | null;
  courseOverviewHref: string;
  isComplete: boolean;
  isNextLocked: boolean;
  currentProgressPercent: number;
  initialProgress: LessonProgressValues;
  markLessonComplete: MarkLessonComplete;
  updateLessonProgress: (lessonId: string, progress: Partial<LessonProgressValues>) => void;
};

function UnlockedLessonPanel({
  courseTitle,
  lesson,
  previousHref,
  nextHref,
  courseOverviewHref,
  isComplete,
  isNextLocked,
  currentProgressPercent,
  initialProgress,
  markLessonComplete,
  updateLessonProgress,
}: UnlockedLessonPanelProps) {
  const articleRef = useRef<HTMLElement>(null);
  const { ref: consoleRef, tiltHandlers } = useCardTilt<HTMLElement>({
    maxRotateX: 10,
    maxRotateY: 12,
    parallax: 36,
  });
  const [readingSeconds, setReadingSeconds] = useState(() => initialProgress.readingTime);
  const [scrollProgressPercent, setScrollProgressPercent] = useState(() => initialProgress.scroll);
  const [textScrolledToBottom, setTextScrolledToBottom] = useState(() => initialProgress.scroll >= 98);
  const [videoProgressPercent, setVideoProgressPercent] = useState(() => initialProgress.watch);
  const [isWatchingVideo, setIsWatchingVideo] = useState(false);
  const [isVerifyingCompletion, setIsVerifyingCompletion] = useState(false);
  const [completionMessage, setCompletionMessage] = useState<string | null>(null);
  const lastAutoSavedProgressRef = useRef<LessonProgressValues>(
    normalizeMeasuredProgress(initialProgress),
  );
  const lessonMode = getLessonMode(lesson);
  const mediaMetadataSources = getLessonMediaMetadataSources(lesson);
  const hasMediaMetadata = mediaMetadataSources.length > 0;
  const protectedMediaLabel = getProtectedMediaLabel(lesson);
  const displayArticleContent = lesson.articleContent.length
    ? lesson.articleContent
    : lesson.summary.trim()
      ? [lesson.summary]
      : [];
  const hasText = displayArticleContent.length > 0;
  const requiresText = lessonMode === "TEXT" || lessonMode === "HYBRID";
  const requiresVideo = lessonMode === "VIDEO" || lessonMode === "HYBRID";
  const getMeasuredProgress = useCallback(
    () =>
      normalizeMeasuredProgress({
        scroll: requiresText ? scrollProgressPercent : 0,
        watch: requiresVideo ? videoProgressPercent : 0,
        readingTime: requiresText ? readingSeconds : 0,
      }),
    [
      readingSeconds,
      requiresText,
      requiresVideo,
      scrollProgressPercent,
      videoProgressPercent,
    ],
  );
  const readingProgressPercent = requiresText
    ? Math.min(100, Math.round((readingSeconds / TEXT_READING_SECONDS) * 100))
    : 100;
  const readingTimeSatisfied = !requiresText || readingSeconds >= TEXT_READING_SECONDS;
  const watchThresholdSatisfied =
    !requiresVideo || videoProgressPercent >= VIDEO_WATCH_THRESHOLD;
  const completionRequirements: CompletionRequirement[] = [
    requiresText
      ? {
          key: "READING_TIME",
          label: "Reading time",
          met: readingTimeSatisfied,
          detail: readingTimeSatisfied
            ? "Recorded"
            : `${Math.max(TEXT_READING_SECONDS - readingSeconds, 0)}s remaining`,
        }
      : null,
    requiresText
      ? {
          key: "TEXT_SCROLL_BOTTOM",
          label: "Scroll bottom",
          met: textScrolledToBottom,
          detail: textScrolledToBottom ? "Reached" : `${scrollProgressPercent}% scanned`,
        }
      : null,
    requiresVideo
      ? {
          key: "WATCH_THRESHOLD",
          label: "Watch threshold",
          met: watchThresholdSatisfied,
          detail: watchThresholdSatisfied
            ? "Recorded"
            : `${Math.max(VIDEO_WATCH_THRESHOLD - videoProgressPercent, 0)}% remaining`,
        }
      : null,
  ].filter((requirement): requirement is CompletionRequirement => Boolean(requirement));
  const unmetRequirements = completionRequirements.filter((requirement) => !requirement.met);
  const requirementsMet = unmetRequirements.length === 0;
  const canMarkComplete =
    !isComplete && !isVerifyingCompletion && requirementsMet;

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") {
      return;
    }

    console.log("[LESSON_RENDER_MODE]", {
      contentMode: lesson?.contentMode,
      type: lesson?.type,
      normalizedMode: lessonMode,
      hasVideo: hasMediaMetadata,
      hasText,
    });
  }, [hasMediaMetadata, hasText, lesson?.contentMode, lesson?.type, lessonMode]);

  const handleTextScroll = useCallback(() => {
    const element = articleRef.current;

    if (!element) {
      return;
    }

    const scrollableDistance = element.scrollHeight - element.clientHeight;
    const nextProgress =
      scrollableDistance <= 0
        ? 100
        : Math.min(100, Math.round((element.scrollTop / scrollableDistance) * 100));

    setScrollProgressPercent((currentProgress) => {
      const persistedProgress = Math.max(currentProgress, nextProgress);

      return persistedProgress;
    });

    if (nextProgress >= 98) {
      setTextScrolledToBottom(true);
    }
  }, []);

  const startVideoSimulation = useCallback(() => {
    setIsWatchingVideo(true);
  }, []);

  const handleCompleteLesson = useCallback(async () => {
    if (!canMarkComplete) {
      return;
    }

    setIsVerifyingCompletion(true);
    setCompletionMessage("Recording backend progress...");

    const progress = getMeasuredProgress();
    const result = await markLessonComplete(lesson.id, {
      lessonType: lessonMode,
      progress,
      requirements: {
        readingTimeSatisfied,
        textScrolledToBottom,
        watchThresholdSatisfied,
      },
    });

    if (result.completed) {
      setCompletionMessage("Lesson completion recorded by the backend.");
    } else if (result.reason === "REQUIREMENTS_UNMET") {
      setCompletionMessage(`Still required: ${result.missingRequirements.join(", ")}`);
    } else {
      setCompletionMessage(result.message ?? "Completion was not confirmed by the backend.");
    }

    setIsVerifyingCompletion(false);
  }, [
    canMarkComplete,
    getMeasuredProgress,
    lesson.id,
    lessonMode,
    markLessonComplete,
    readingTimeSatisfied,
    textScrolledToBottom,
    watchThresholdSatisfied,
  ]);

  useEffect(() => {
    if (!requiresText || isComplete || readingTimeSatisfied) {
      return;
    }

    const timerId = window.setInterval(() => {
      setReadingSeconds((currentSeconds) => {
        const nextSeconds = Math.min(TEXT_READING_SECONDS, currentSeconds + 1);

        return nextSeconds;
      });
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [isComplete, readingTimeSatisfied, requiresText]);

  useEffect(() => {
    if (!requiresVideo || !isWatchingVideo || videoProgressPercent >= 100) {
      return;
    }

    const timerId = window.setInterval(() => {
      setVideoProgressPercent((currentProgress) => {
        const nextProgress = Math.min(100, currentProgress + 9);

        if (nextProgress >= 100) {
          setIsWatchingVideo(false);
        }

        return nextProgress;
      });
    }, 700);

    return () => window.clearInterval(timerId);
  }, [isWatchingVideo, requiresVideo, videoProgressPercent]);

  useEffect(() => {
    if (!requiresText) {
      return;
    }

    const frameId = window.requestAnimationFrame(handleTextScroll);

    return () => window.cancelAnimationFrame(frameId);
  }, [handleTextScroll, requiresText]);

  useEffect(() => {
    if (isComplete) {
      return;
    }

    const currentProgress = getMeasuredProgress();

    if (!hasMeaningfulMeasuredProgress(currentProgress, requiresText, requiresVideo)) {
      return;
    }

    if (
      !measuredProgressChanged(
        lastAutoSavedProgressRef.current,
        currentProgress,
        requiresText,
        requiresVideo,
      )
    ) {
      return;
    }

    const timerId = window.setTimeout(() => {
      updateLessonProgress(lesson.id, currentProgress);
      lastAutoSavedProgressRef.current = currentProgress;
    }, LESSON_PROGRESS_AUTOSAVE_DELAY_MS);

    return () => window.clearTimeout(timerId);
  }, [
    getMeasuredProgress,
    isComplete,
    lesson.id,
    requiresText,
    requiresVideo,
    updateLessonProgress,
  ]);

  return (
    <section className="lesson-console-grid">
      <section
        ref={consoleRef}
        {...tiltHandlers}
        data-lesson-type={lessonMode}
        className="lesson-console-main"
      >
        <span className="lesson-console-main__grid" aria-hidden="true" />
        <span className="lesson-console-main__glow" aria-hidden="true" />

        {requiresVideo ? (
          <VideoPlaceholder
            lessonType={lessonMode === "HYBRID" ? "HYBRID" : "VIDEO"}
            hasMediaMetadata={hasMediaMetadata}
            mediaLabel={protectedMediaLabel}
            metadataSources={mediaMetadataSources}
            progressPercent={videoProgressPercent}
            thresholdPercent={VIDEO_WATCH_THRESHOLD}
            isWatching={isWatchingVideo}
            onStart={startVideoSimulation}
          />
        ) : null}

        {requiresText ? (
          <article
            ref={articleRef}
            onScroll={handleTextScroll}
            className="lesson-article-panel lesson-console-content max-h-[31rem] overflow-y-auto px-6 py-7"
          >
            <div className="lesson-article-panel__header">
              <div>
                <p className="lesson-panel-kicker">Tactical Briefing</p>
                <h2 className="font-display text-2xl font-semibold text-white">
                  Lesson Overview
                </h2>
              </div>
              <span className="lesson-scroll-readout">{scrollProgressPercent}% scanned</span>
            </div>
            <div className="mt-6 max-w-3xl space-y-5 text-base leading-8 text-foreground/72">
              {displayArticleContent.length ? displayArticleContent.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              )) : (
                <p className="text-foreground/54">
                  Lesson text has not been attached by the backend yet.
                </p>
              )}
            </div>
          </article>
        ) : null}
      </section>

      <aside
        data-ready={requirementsMet || isComplete ? "true" : "false"}
        className="lesson-control-center"
      >
        <div className="relative z-10 space-y-6">
          <div>
            <p className="lesson-panel-kicker">Lesson Progress</p>
            <div className="mt-4 space-y-4">
              {requiresVideo ? (
                  <div>
                    <div className="lesson-meter-label">
                      <span>Watch Progress</span>
                      <span><AnimatedNumber value={videoProgressPercent} suffix="%" /></span>
                    </div>
                  <SignalProgressBar value={videoProgressPercent} variant={lessonMode === "HYBRID" ? "purple" : "cyan"} />
                </div>
              ) : null}

              {requiresText ? (
                <>
                  <div>
                    <div className="lesson-meter-label">
                      <span>Reading Time</span>
                      <span><AnimatedNumber value={readingProgressPercent} suffix="%" /></span>
                    </div>
                    <SignalProgressBar value={readingProgressPercent} variant="green" />
                  </div>
                  <div>
                    <div className="lesson-meter-label">
                      <span>Scroll Progress</span>
                      <span><AnimatedNumber value={scrollProgressPercent} suffix="%" /></span>
                    </div>
                    <SignalProgressBar value={scrollProgressPercent} variant="cyan" />
                  </div>
                </>
              ) : null}
            </div>
          </div>

          <div className="lesson-requirement-list">
            {completionRequirements.map((requirement) => (
              <span
                key={requirement.key}
                className={cn(
                  "lesson-requirement-chip",
                  requirement.met ? "lesson-requirement-chip--met" : "lesson-requirement-chip--pending",
                )}
              >
                {requirement.met ? <CheckIcon className="h-3.5 w-3.5" /> : <LockIcon className="h-3.5 w-3.5" />}
                <span>{requirement.label}</span>
                <span>{requirement.detail}</span>
              </span>
            ))}
          </div>

          <PrimaryButton
            type="button"
            tone={requirementsMet || isComplete ? "cyan" : "pink"}
            loading={isVerifyingCompletion}
            disabled={!canMarkComplete}
            onClick={handleCompleteLesson}
            title={
              unmetRequirements.length
                ? `Unmet: ${unmetRequirements.map((requirement) => requirement.label).join(", ")}`
                : undefined
            }
            className={cn("lesson-complete-trigger", requirementsMet ? "lesson-complete-trigger--ready" : "")}
          >
            {isComplete
              ? "Lesson Complete"
              : unmetRequirements.length
                ? "Requirements Unmet"
                : "Mark Lesson Complete"}
          </PrimaryButton>

          {unmetRequirements.length ? (
            <p className="lesson-unmet-note">
              Unmet: {unmetRequirements.map((requirement) => requirement.label).join(", ")}
            </p>
          ) : (
            <p className="lesson-ready-note">
              Requirements met. Backend progress can be recorded.
            </p>
          )}

          {completionMessage ? (
            <p className="lesson-verification-message">
              {completionMessage}
            </p>
          ) : null}

          <AiTutorPanel
            courseTitle={courseTitle}
            lessonTitle={lesson.title}
            lessonType={lessonMode}
            currentProgressPercent={currentProgressPercent}
            lessonExcerpt={displayArticleContent.join("\n\n")}
          />

          <div className="lesson-backend-note">
            <ShieldLockIcon className="h-5 w-5" />
            <span>
              Lesson progress is recorded through the student backend.
            </span>
          </div>

          <div className="grid gap-3">
            {nextHref && !isNextLocked ? (
              <Link href={nextHref} className="lesson-next-command">
                <span>Continue to Next Lesson</span>
                <ArrowRightIcon className="h-4 w-4" />
              </Link>
            ) : nextHref ? (
              <span className="lesson-next-command lesson-next-command--locked">
                <span>Next Lesson Locked</span>
                <LockIcon className="h-4 w-4" />
              </span>
            ) : (
              <Link href={courseOverviewHref} className="lesson-next-command">
                <span>Course Overview</span>
                <ArrowRightIcon className="h-4 w-4" />
              </Link>
            )}

            {previousHref ? (
              <Link href={previousHref} className="lesson-secondary-command">
                <ArrowBackIcon className="h-4 w-4" />
                <span>Previous Lesson</span>
              </Link>
            ) : null}
          </div>
        </div>
      </aside>
    </section>
  );
}

type LessonAccessRequiredStateProps = {
  course: Course;
  lessonTitle?: string | null;
  isLoading?: boolean;
  isEnrolled?: boolean;
  nextAvailableHref?: string | null;
  lessonIds: string[];
  lessonRouteInputs: CourseProgressLessonInput[];
  isEnrolling?: boolean;
  enrollmentError?: string | null;
  onEnroll?: () => void;
};

function LessonAccessRequiredState({
  course,
  lessonTitle,
  isLoading = false,
  isEnrolled = false,
  nextAvailableHref = null,
  lessonIds,
  lessonRouteInputs,
  isEnrolling = false,
  enrollmentError = null,
  onEnroll,
}: LessonAccessRequiredStateProps) {
  const routeCourseId = getCourseRouteId(course);
  const courseOverviewHref = `/courses/${routeCourseId}`;
  const enrollmentCourseId = routeCourseId;
  const canEnroll = !isLoading && !isEnrolled && Boolean(enrollmentCourseId) && Boolean(onEnroll);
  const title = isLoading
    ? "Checking lesson access..."
    : isEnrolled
      ? "Complete earlier lessons first."
      : "Enroll in this course to access lessons.";
  const description = isLoading
    ? "We are syncing your enrollment and lesson access with the student backend."
    : isEnrolled
      ? "This lesson is still protected. Continue from the next backend-confirmed lesson or return to the course."
      : "Enrollment belongs on the course page. You can go back to review the course, or enroll securely here if this lesson URL was opened directly.";

  return (
    <section className="lesson-access-page flex flex-1 items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
      <GlowCard tone={isLoading ? "cyan" : isEnrolled ? course.tone : "pink"} className="lesson-access-card w-full max-w-2xl px-7 py-8 sm:px-9 sm:py-10">
        <div className="relative z-10 space-y-6">
          <div className="lesson-access-icon">
            <ShieldLockIcon className="h-6 w-6" />
          </div>
          <div>
            <p className="lesson-panel-kicker text-primary/76">
              {isLoading ? "Verifying Access" : isEnrolled ? "Lesson Protected" : "Access Required"}
            </p>
            <h1 className="mt-3 font-display text-3xl font-bold uppercase text-white sm:text-4xl">
              {title}
            </h1>
            <p className="mt-4 text-sm leading-7 text-foreground/68">{description}</p>
          </div>

          {lessonTitle ? (
            <div className="lesson-access-target">
              <span>Requested lesson</span>
              <strong>{lessonTitle}</strong>
            </div>
          ) : null}

          {!isLoading ? (
            <div className="lesson-access-actions">
              {canEnroll ? (
                <PrimaryButton
                  type="button"
                  tone={course.tone}
                  loading={isEnrolling}
                  disabled={isEnrolling}
                  onClick={onEnroll}
                  className="lesson-access-enroll min-h-12 px-4 py-3 text-[0.68rem]"
                >
                  <span className="inline-flex items-center justify-center gap-2">
                    Enroll Securely
                    <PlusIcon className="h-4 w-4" />
                  </span>
                </PrimaryButton>
              ) : null}

              {isEnrolled && nextAvailableHref ? (
                <Link href={nextAvailableHref} className="nav-action nav-action--primary">
                  Continue Next Available Lesson
                </Link>
              ) : null}

              <Link href={courseOverviewHref} className="nav-action nav-action--ghost">
                Back to Course
              </Link>
            </div>
          ) : null}

          {!isLoading && !isEnrolled && !canEnroll ? (
            <p className="text-sm leading-6 text-tertiary/72">
              Enrollment is available from the course page once the backend course id is synced.
            </p>
          ) : null}

          {enrollmentError ? (
            <p className="text-sm leading-6 text-tertiary/72">{enrollmentError}</p>
          ) : null}

          <span className="sr-only">{lessonRouteInputs.length} route-safe lessons loaded for {lessonIds.length} lessons.</span>
        </div>
      </GlowCard>
    </section>
  );
}

function StudentLessonPagePanel({ course, lessonId }: LessonPagePanelProps) {
  const router = useRouter();
  const {
    course: studentCourse,
    errorMessage: lessonErrorMessage,
    isLoading: lessonLoading,
    lessonAccess,
    refresh: refreshStudentLesson,
  } = useStudentLesson(course.id, lessonId, course, true);
  const [isEnrollingFromGate, setIsEnrollingFromGate] = useState(false);
  const [enrollmentError, setEnrollmentError] = useState<string | null>(null);
  const activeCourse = studentCourse;
  const activeCourseRouteId = getCourseRouteId(activeCourse);
  const activeCourseApiId = activeCourseRouteId;
  const reduceMotion = useReducedMotion();
  const { ref: pageRef, tiltHandlers: pageTiltHandlers } = useCardTilt<HTMLDivElement>({
    maxRotateX: 2,
    maxRotateY: 3,
    parallax: 30,
  });
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
  const navigation = useMemo(() => getLessonNavigation(activeCourse, lessonId), [activeCourse, lessonId]);
  const {
    completedLessonSet,
    enrollCourse,
    lessonProgressById,
    lockedLessonSet,
    markLessonComplete,
    progress,
    updateLessonProgress,
  } = useCourseProgress(activeCourseRouteId, lessonProgressInputs, activeCourse, activeCourseApiId);
  const current = navigation.current;
  const lesson = current?.lesson;
  const lessonMode = lesson ? getLessonMode(lesson) : "TEXT";
  const previousHref = getLessonHref(navigation.previous, lessonRouteInputs);
  const nextHref = getLessonHref(navigation.next, lessonRouteInputs);
  const isComplete = lesson ? completedLessonSet.has(lesson.id) : false;
  const lessonEndpointAllowsContent = lessonAccess.status === 200 && lessonAccess.canAccess;
  const lessonAccessDenied = isLessonAccessDenied(lessonAccess.reason);
  const isLocked = lesson ? !lessonEndpointAllowsContent && lockedLessonSet.has(lesson.id) : true;
  const isNextLocked = navigation.next ? lockedLessonSet.has(navigation.next.lesson.id) : false;
  const courseOverviewHref = `/courses/${activeCourseRouteId}`;
  const nextAvailableLessonId = progress.nextLessonId ?? progress.currentLessonId;
  const nextAvailableHref = nextAvailableLessonId
    ? getSafeEnrollmentLessonHref(
        activeCourseRouteId,
        activeCourse,
        nextAvailableLessonId,
        lessonRouteInputs,
        activeCourse,
      )
    : null;
  const nextLessonResolution = useMemo(() => {
    const currentLessonSlug = getRouteSafeLessonValue(lessonId) ?? getBrowserLessonSlug(lesson);
    const normalizedCurrentLessonSlug = normalizeLessonRouteValue(currentLessonSlug);
    const routeOrderedLessons = orderedLessons.map((reference, lessonIndex) => ({
      reference,
      routeSlug:
        getRouteSafeLessonValue(lessonRouteInputs[lessonIndex]?.slug) ??
        getBrowserLessonSlug(reference.lesson),
    }));
    const currentIndex = normalizedCurrentLessonSlug
      ? routeOrderedLessons.findIndex(
          (entry) => normalizeLessonRouteValue(entry.routeSlug) === normalizedCurrentLessonSlug,
        )
      : -1;
    const next = currentIndex >= 0 ? routeOrderedLessons[currentIndex + 1] : null;
    const nextLessonSlug = next?.routeSlug ?? null;
    const href = nextLessonSlug ? `/courses/${activeCourseRouteId}/lessons/${nextLessonSlug}` : null;

    return {
      currentLessonSlug,
      currentIndex,
      nextLessonId: next?.reference.lesson.id ?? null,
      nextLessonSlug,
      isLocked: next ? lockedLessonSet.has(next.reference.lesson.id) : false,
      href,
    };
  }, [activeCourseRouteId, lesson, lessonId, lessonRouteInputs, lockedLessonSet, orderedLessons]);
  const nextRouteHref = isComplete ? nextLessonResolution.href ?? nextAvailableHref ?? nextHref : nextHref;
  const nextRouteIsLocked =
    isComplete && nextLessonResolution.href
      ? nextLessonResolution.isLocked
      : nextRouteHref === nextHref
        ? isNextLocked
        : false;

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") {
      return;
    }

    console.log("[NEXT_LESSON_RESOLUTION]", {
      currentLessonSlug: nextLessonResolution.currentLessonSlug,
      currentIndex: nextLessonResolution.currentIndex,
      nextLessonId: nextLessonResolution.nextLessonId,
      nextLessonSlug: nextLessonResolution.nextLessonSlug,
      href: nextLessonResolution.href,
    });
  }, [nextLessonResolution]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") {
      return;
    }

    console.log("[lesson-access]", {
      courseSlug: activeCourseRouteId,
      lessonSlug: lessonId,
      status: lessonAccess.status,
      backendLocked: lessonAccess.backendLocked,
      enrollmentStatus: lessonAccess.enrollmentStatus ?? activeCourse.enrollmentStatus ?? null,
      hasContent: lessonAccess.hasContent,
      reason: lessonAccess.reason,
    });
  }, [
    activeCourse.enrollmentStatus,
    activeCourseRouteId,
    lessonAccess.backendLocked,
    lessonAccess.enrollmentStatus,
    lessonAccess.hasContent,
    lessonAccess.reason,
    lessonAccess.status,
    lessonId,
  ]);

  async function handleEnrollFromLessonGate() {
    setEnrollmentError(null);
    setIsEnrollingFromGate(true);

    try {
      const payload = await enrollCourse();
      let refreshedCourse: Course | null = null;
      let refreshedAccess = lessonAccess;

      try {
        const refreshedLesson = await refreshStudentLesson();
        refreshedCourse = refreshedLesson.course;
        refreshedAccess = refreshedLesson.access;
      } catch {
        refreshedCourse = null;
      }

      const routeSource = refreshedCourse ?? payload;
      const courseAfterEnroll = refreshedCourse ?? activeCourse;
      const courseRouteId = getCourseRouteId(courseAfterEnroll);
      const refreshedLessonInputs = refreshedCourse
        ? getCourseLessonInputs(refreshedCourse)
        : lessonProgressInputs;
      const refreshedProgress = buildCourseProgress(
        courseRouteId,
        refreshedLessonInputs,
        routeSource,
      );
      const refreshedNavigation = refreshedCourse
        ? getLessonNavigation(refreshedCourse, lessonId)
        : navigation;
      const refreshedLesson = refreshedNavigation.current?.lesson ?? null;
      const refreshedLessonIsLocked =
        refreshedLesson
          ? refreshedProgress.lessonStates.some(
              (lessonState) => lessonState.lessonId === refreshedLesson.id && lessonState.isLocked,
            )
          : true;

      if (refreshedAccess.status === 200 && refreshedAccess.canAccess) {
        return;
      }

      if (!isLessonAccessDenied(refreshedAccess.reason) && refreshedLesson && !refreshedLessonIsLocked) {
        return;
      }

      if (isLessonAccessDenied(refreshedAccess.reason)) {
        router.replace(`/courses/${courseRouteId}`);
      } else {
        setEnrollmentError("Enrollment synced, but the lesson response did not confirm access yet.");
      }
    } catch (error) {
      logEnrollmentError(error);
      setEnrollmentError("Enrollment could not be completed. Please try again.");
    } finally {
      setIsEnrollingFromGate(false);
    }
  }

  if (!current || !lesson) {
    return (
      <LessonAccessRequiredState
        course={activeCourse}
        isEnrolled={progress.isEnrolled}
        nextAvailableHref={nextAvailableHref}
        lessonIds={lessonIds}
        lessonRouteInputs={lessonRouteInputs}
        isEnrolling={isEnrollingFromGate}
        enrollmentError={enrollmentError}
        onEnroll={() => void handleEnrollFromLessonGate()}
      />
    );
  }

  if (lessonLoading && !lessonEndpointAllowsContent) {
    return (
      <LessonAccessRequiredState
        course={activeCourse}
        lessonTitle={lesson.title}
        isLoading
        lessonIds={lessonIds}
        lessonRouteInputs={lessonRouteInputs}
        isEnrolling={isEnrollingFromGate}
        enrollmentError={enrollmentError}
        onEnroll={() => void handleEnrollFromLessonGate()}
      />
    );
  }

  if (lessonAccessDenied) {
    return (
      <LessonAccessRequiredState
        course={activeCourse}
        lessonTitle={lesson.title}
        isEnrolled={progress.isEnrolled}
        nextAvailableHref={nextAvailableHref}
        lessonIds={lessonIds}
        lessonRouteInputs={lessonRouteInputs}
        isEnrolling={isEnrollingFromGate}
        enrollmentError={enrollmentError}
        onEnroll={() => void handleEnrollFromLessonGate()}
      />
    );
  }

  return (
    <motion.div
      ref={pageRef}
      {...pageTiltHandlers}
      data-tone={activeCourse.tone}
      data-lesson-type={lessonMode}
      className="lesson-viewer-page mx-auto flex w-full max-w-[1680px] flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-10"
      initial={reduceMotion ? false : { opacity: 0, y: 18 }}
      animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.52, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="lesson-viewer-depth" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>

      <div className="lesson-viewer-topbar">
        <Link href={courseOverviewHref} className="lesson-back-link">
          <ArrowBackIcon className="h-4 w-4" />
          <span>Back to Course</span>
        </Link>
        <div className="lesson-topbar-status">
          <span>Lesson {current.lessonIndex + 1} of {progress.totalLessons}</span>
          <span>{isComplete ? "Completed" : isLocked ? "Locked" : "Current"}</span>
        </div>
      </div>

      <header className="lesson-viewer-header">
        <div className="min-w-0">
          <p className="lesson-panel-kicker text-primary/76">
            {activeCourse.title} / {current.sectionTitle}
          </p>
          <h1 className="mt-4 font-display text-4xl font-bold uppercase text-white sm:text-5xl xl:text-6xl">
            {lesson.title}
          </h1>
          <div className="lesson-viewer-type-callout mt-5">
            <LessonTypeBadge
              type={lessonMode}
              prominent
              protectedLabel={MEDIA_PROTECTION_LABEL}
            />
            <span className="lesson-duration-chip">{lesson.durationMinutes}m Tactical Session</span>
          </div>
        </div>
        <GlowCard tone={activeCourse.tone} corners={false} className="lesson-header-progress px-6 py-5">
          <div className="relative z-10">
            <p className="lesson-panel-kicker">Overall Progress</p>
            <div className="mt-4 flex items-end justify-between gap-4">
              <span className="font-display text-4xl font-semibold text-white">
                <AnimatedNumber value={progress.progressPercent} suffix="%" />
              </span>
              <span className="pb-1 font-label text-[0.68rem] uppercase text-foreground/52">
                <AnimatedNumber value={progress.completedCount} />/{progress.totalLessons} complete
              </span>
            </div>
            <SignalProgressBar value={progress.progressPercent} variant={progress.progressPercent === 100 ? "green" : "cyan"} className="mt-4" />
          </div>
        </GlowCard>
      </header>

      <section className="lesson-viewer-layout">
        <LessonSidebar
          references={orderedLessons}
          activeLessonId={lesson.id}
          progressPercent={progress.progressPercent}
          completedCount={progress.completedCount}
          totalLessons={progress.totalLessons}
          completedLessonSet={completedLessonSet}
          lockedLessonSet={lockedLessonSet}
          lessonRouteInputs={lessonRouteInputs}
          previousHref={previousHref}
          nextHref={nextRouteHref}
          isNextLocked={nextRouteIsLocked}
        />

        <main className="lesson-viewer-stage">
          <UnlockedLessonPanel
            key={lesson.id}
            courseTitle={activeCourse.title}
            lesson={lesson}
            previousHref={previousHref}
            nextHref={nextRouteHref}
            courseOverviewHref={courseOverviewHref}
            isComplete={isComplete}
            isNextLocked={nextRouteIsLocked}
            currentProgressPercent={progress.progressPercent}
            initialProgress={lessonProgressById[lesson.id] ?? {
              scroll: 0,
              watch: 0,
              readingTime: 0,
            }}
            markLessonComplete={markLessonComplete}
            updateLessonProgress={updateLessonProgress}
          />
        </main>
      </section>

      <footer className="lesson-viewer-footer">
        <ShieldLockIcon className="h-4 w-4" />
        <span>
          {lessonLoading
            ? "Syncing lesson from backend"
            : lessonErrorMessage ?? "Student lesson progress is backend-backed"}
        </span>
      </footer>
    </motion.div>
  );
}

function LessonAccessState({
  courseId,
  isLoading = false,
}: {
  courseId: string;
  isLoading?: boolean;
}) {
  return (
    <section className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
      <GlowCard tone={isLoading ? "cyan" : "pink"} className="w-full max-w-xl px-8 py-10 text-center">
        <p className="font-label text-[0.72rem] uppercase text-primary/72">
          {isLoading ? "Lesson Access" : "Protected Lesson"}
        </p>
        <h1 className="mt-4 font-display text-4xl font-bold text-white">
          {isLoading ? "Checking access..." : "Student sign-in required"}
        </h1>
        <p className="mt-4 text-sm leading-7 text-foreground/68">
          Lessons, progress recording, protected media, and AI Tutor actions require an
          authenticated student context. Backend RBAC remains authoritative.
        </p>
        {!isLoading ? (
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link href="/login" className="nav-action nav-action--primary">
              Sign In
            </Link>
            <Link href={`/courses/${courseId}`} className="nav-action nav-action--ghost">
              Course Preview
            </Link>
          </div>
        ) : null}
      </GlowCard>
    </section>
  );
}

export function LessonPagePanel({ course, lessonId }: LessonPagePanelProps) {
  const { status, user } = useAuthSession();
  const isStudent = status === "authenticated" && isStudentUser(user);

  if (status === "loading") {
    return <LessonAccessState courseId={course.id} isLoading />;
  }

  return isStudent ? (
    <StudentLessonPagePanel course={course} lessonId={lessonId} />
  ) : (
    <LessonAccessState courseId={course.id} />
  );
}
