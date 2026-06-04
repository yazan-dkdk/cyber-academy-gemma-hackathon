"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  enrollStudentCourse,
  fetchStudentActivity,
  fetchStudentContinueLearning,
  fetchStudentCourse,
  fetchStudentCourses,
  fetchStudentDashboard,
  fetchStudentLesson,
  updateStudentLessonProgress,
  StudentApiError,
} from "@/lib/student-api-client";
import { logCourseBackendFallback } from "@/lib/courses/fallback-logging";
import type {
  Course,
  CourseDifficulty,
  CourseLesson,
  CourseProgress,
  CourseSection,
  CourseSummary,
  CourseSource,
  CourseTone,
  LessonProgressValues,
  LessonState,
  LessonType,
} from "@/lib/courses/types";
import {
  getCourseRouteId,
  lessonMatchesIdentifier,
  normalizeCourseRouteId,
  normalizeRouteValue,
} from "@/lib/courses/routing";

const completedReadingTimeSeconds = 10;
const completedTextScrollPercent = 90;
const completedWatchPercent = 85;
const legacyProgressPrefixes = [
  "vincere-cryptex:course-enrollment:",
  "vincere-cryptex:course-progress:",
  "vincere-cryptex:course-activity:",
] as const;
const studentProgressUpdatedEvent = "vincere-cryptex:student-progress-updated";
export const enrollmentNoLessonRouteMessage =
  "Enrollment active. Choose the first lesson from the syllabus.";

let legacyProgressStorageCleared = false;
let studentProgressVersion = 0;

const studentProgressSubscribers = new Set<() => void>();
const studentCourseSourceByKey = new Map<string, unknown>();

export type CourseProgressLessonInput =
  | string
  | {
      id: string;
      backendId?: string | null;
      slug?: string | null;
      isLocked?: boolean | null;
      type: LessonType;
    };

type NormalizedLessonInput = {
  id: string;
  backendId?: string | null;
  slug?: string | null;
  isLocked?: boolean | null;
  type: LessonType;
};

export type LessonCompletionRequirementKey =
  | "READING_TIME"
  | "TEXT_SCROLL_BOTTOM"
  | "WATCH_THRESHOLD";

export type LessonCompletionVerification = {
  lessonType: LessonType;
  progress: LessonProgressValues;
  requirements: {
    readingTimeSatisfied: boolean;
    textScrolledToBottom: boolean;
    watchThresholdSatisfied: boolean;
  };
};

type LessonProgressPostPayload = {
  scrollPercent?: number;
  watchPercent?: number;
  readingTimeSeconds?: number;
  completed: boolean;
};

export type MarkLessonCompleteResult =
  | {
      completed: true;
      payload: unknown;
    }
  | {
      completed: false;
      reason: "LOCKED" | "ALREADY_COMPLETED" | "REQUIREMENTS_UNMET" | "BACKEND_REJECTED";
      missingRequirements: LessonCompletionRequirementKey[];
      message?: string;
    };

export type RestartableCourseState = {
  progress: number;
};

export type ContinueLearningItem = CourseSummary & {
  currentLessonTitle?: string | null;
  currentLessonSummary?: string | null;
  href?: string | null;
};

export type StudentActivityItem = {
  id: string;
  label: string;
  description: string;
  createdAt: string | null;
  tone: "cyan" | "purple" | "pink" | "neutral";
  type: string | null;
  dedupeKey?: string;
};

export type StudentAchievementItem = {
  id: string;
  label: string;
  description: string | null;
  earnedAt: string | null;
  isEarned: boolean;
  progressPercent: number | null;
  tone: "cyan" | "purple" | "pink" | "neutral";
  type: string | null;
};

export type StudentActiveChallengeItem = {
  id: string | null;
  slug: string | null;
  title: string;
  category: string | null;
  difficulty: string | null;
  status: string;
  solvedAt: string | null;
  href: string | null;
};

export type StudentDashboardSummary = {
  completedLessons: number | null;
  totalLessons: number | null;
  averageProgress: number | null;
  enrolledCourses: number | null;
  enrolledCourseItems: CourseSummary[];
  activity: StudentActivityItem[];
  achievements: StudentAchievementItem[];
  nextBadge: StudentAchievementItem | null;
  activeChallenge: StudentActiveChallengeItem | null;
};

type AsyncState<T> = {
  data: T;
  isLoading: boolean;
  errorMessage: string | null;
};

export type StudentLessonAccessState = {
  canAccess: boolean;
  status: number | null;
  backendLocked: boolean | null;
  enrollmentStatus: string | null;
  hasContent: boolean;
  reason: string;
};

type StudentLessonAsyncState = AsyncState<Course> & {
  access: StudentLessonAccessState;
};

type StudentLessonLoadResult = {
  course: Course;
  errorMessage: string | null;
  access: StudentLessonAccessState;
};

type ProgressMetadata = {
  enrollmentStatus: string | null;
  isEnrolled: boolean | null;
  progressPercent: number | null;
  completedLessonIds: string[];
  completedCount: number | null;
  totalLessons: number | null;
  currentLessonId: string | null;
  nextLessonId: string | null;
  lessonStates: LessonState[];
  lessonProgress: Record<string, LessonProgressValues>;
  lastAccessedAt: string | null;
};

// TODO: Future feature: Restart Course (Phase 2 or later)
export function canRestartCourse(course: RestartableCourseState) {
  return course.progress === 100;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeLessonInputs(lessonInputs: CourseProgressLessonInput[]): NormalizedLessonInput[] {
  return lessonInputs.map((lessonInput) =>
    typeof lessonInput === "string"
      ? {
          id: lessonInput,
          type: "TEXT",
        }
      : {
          id: lessonInput.id,
          backendId: lessonInput.backendId,
          slug: lessonInput.slug,
          isLocked: lessonInput.isLocked,
          type: lessonInput.type,
        },
  );
}

function clampPercentage(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(100, Math.round(value)))
    : 0;
}

function clampReadingTime(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(60 * 60, Math.round(value)))
    : 0;
}

function normalizeProgressValues(value: unknown): LessonProgressValues {
  if (!isRecord(value)) {
    return {
      scroll: 0,
      watch: 0,
      readingTime: 0,
    };
  }

  return {
    scroll: clampPercentage(value.scroll ?? value.scrollPercent ?? value.scrollProgress),
    watch: clampPercentage(value.watch ?? value.watchPercent ?? value.watchProgress),
    readingTime: clampReadingTime(value.readingTime ?? value.readingTimeSeconds),
  };
}

function readString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function readNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }

  return null;
}

function readCount(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.max(0, Math.round(value));
    }

    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
      return Math.max(0, Math.round(Number(value)));
    }

    if (Array.isArray(value)) {
      return value.length;
    }
  }

  return null;
}

function readBoolean(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "boolean") {
      return value;
    }
  }

  return null;
}

function readNestedRecord(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (isRecord(value)) {
      return value;
    }
  }

  return null;
}

function readNestedString(record: Record<string, unknown>, nestedKeys: string[], keys: string[]) {
  const nestedRecord = readNestedRecord(record, nestedKeys);
  return nestedRecord ? readString(nestedRecord, keys) : null;
}

function readNestedNumber(record: Record<string, unknown>, nestedKeys: string[], keys: string[]) {
  const nestedRecord = readNestedRecord(record, nestedKeys);
  return nestedRecord ? readNumber(nestedRecord, keys) : null;
}

function readNestedCount(record: Record<string, unknown>, nestedKeys: string[], keys: string[]) {
  const nestedRecord = readNestedRecord(record, nestedKeys);
  return nestedRecord ? readCount(nestedRecord, keys) : null;
}

function readNestedBoolean(record: Record<string, unknown>, nestedKeys: string[], keys: string[]) {
  const nestedRecord = readNestedRecord(record, nestedKeys);
  return nestedRecord ? readBoolean(nestedRecord, keys) : null;
}

function readBooleanDeep(value: unknown, keys: string[], seen = new Set<unknown>()): boolean | null {
  if (!isRecord(value) || seen.has(value)) {
    return null;
  }

  seen.add(value);

  const directValue = readBoolean(value, keys);

  if (directValue !== null) {
    return directValue;
  }

  for (const item of Object.values(value)) {
    const nestedValue = readBooleanDeep(item, keys, seen);

    if (nestedValue !== null) {
      return nestedValue;
    }
  }

  return null;
}

function readArray(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (Array.isArray(value)) {
      return value;
    }
  }

  return null;
}

function readValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (value !== undefined && value !== null) {
      return value;
    }
  }

  return null;
}

function readNestedArray(record: Record<string, unknown>, nestedKeys: string[], keys: string[]) {
  const nestedRecord = readNestedRecord(record, nestedKeys);
  return nestedRecord ? readArray(nestedRecord, keys) : null;
}

function normalizeEnrollmentStatus(status: string | null) {
  return status?.trim().toLowerCase().replace(/\s+/g, "_") ?? null;
}

function isEnrolledStatus(status: string | null) {
  const normalizedStatus = normalizeEnrollmentStatus(status);

  if (!normalizedStatus) {
    return null;
  }

  if (
    [
      "not_enrolled",
      "unenrolled",
      "open",
      "available",
      "inactive",
      "preview",
      "guest",
    ].includes(normalizedStatus)
  ) {
    return false;
  }

  return ["enrolled", "active", "in_progress", "completed", "complete"].includes(normalizedStatus)
    ? true
    : null;
}

function normalizeDifficulty(value: unknown, fallback: CourseDifficulty = "beginner") {
  return value === "beginner" || value === "intermediate" || value === "advanced"
    ? value
    : fallback;
}

function normalizeTone(value: unknown, fallback: CourseTone = "cyan") {
  return value === "cyan" || value === "purple" || value === "pink" || value === "neutral"
    ? value
    : fallback;
}

function readLessonTypeValue(value: unknown): LessonType | null {
  if (value === "TEXT" || value === "VIDEO" || value === "HYBRID") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toUpperCase();

    if (normalized === "TEXT" || normalized === "VIDEO" || normalized === "HYBRID") {
      return normalized;
    }
  }

  return null;
}

export function normalizeLessonMode(
  contentMode: unknown,
  type: unknown,
  fallback: LessonType = "TEXT",
): LessonType {
  return readLessonTypeValue(contentMode) ?? readLessonTypeValue(type) ?? fallback;
}

function combineNestedCourseRecord(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  const nestedCourse = readNestedRecord(value, ["course", "studentCourse"]);

  if (!nestedCourse) {
    return value;
  }

  return {
    ...nestedCourse,
    ...value,
  };
}

function readCourseContainerRecord(record: Record<string, unknown>) {
  return readNestedRecord(record, ["course", "courseDetails", "courseInfo", "studentCourse"]);
}

function readCourseContainerString(record: Record<string, unknown>, keys: string[]) {
  const courseRecord = readCourseContainerRecord(record);
  return courseRecord ? readString(courseRecord, keys) : null;
}

function getExplicitBackendCourseIdFromRecord(record: Record<string, unknown>) {
  const courseRecord = readCourseContainerRecord(record);
  const explicitCourseId = readString(record, [
    "backendId",
    "courseId",
    "courseID",
    "course_id",
  ]);
  const nestedCourseId = courseRecord
    ? readString(courseRecord, ["backendId", "id", "_id", "courseId", "courseID", "course_id"])
    : null;
  const nestedEnrollmentCourseId = readNestedString(
    record,
    ["enrollment", "studentEnrollment", "progress", "courseProgress"],
    ["backendId", "courseId", "courseID", "course_id"],
  );

  if (explicitCourseId) {
    return explicitCourseId;
  }

  if (nestedCourseId) {
    return nestedCourseId;
  }

  if (nestedEnrollmentCourseId) {
    return nestedEnrollmentCourseId;
  }

  return null;
}

function getBackendCourseIdFromRecord(
  record: Record<string, unknown>,
  fallbackId: string | null = null,
) {
  const explicitBackendId = getExplicitBackendCourseIdFromRecord(record);

  if (explicitBackendId) {
    return explicitBackendId;
  }

  const courseRecord = readCourseContainerRecord(record);

  if (!courseRecord) {
    return readString(record, ["id", "_id"]) ?? fallbackId;
  }

  return fallbackId;
}

function getCourseSlugFromRecord(
  record: Record<string, unknown>,
  fallbackSlug: string | null = null,
) {
  return (
    readString(record, ["slug", "courseSlug", "publicId", "publicSlug", "routeId"]) ??
    readCourseContainerString(record, [
      "slug",
      "courseSlug",
      "publicId",
      "publicSlug",
      "routeId",
    ]) ??
    fallbackSlug
  );
}

function getRouteCourseIdFromRecord(
  record: Record<string, unknown>,
  fallbackId: string | null = null,
) {
  return getCourseSlugFromRecord(record, fallbackId) ?? fallbackId ?? getBackendCourseIdFromRecord(record);
}

type CourseIdentifierFallback = {
  id?: string | null;
  backendId?: string | null;
  slug?: string | null;
  title?: string | null;
};

function normalizeCourseIdentifiers(value: unknown, fallback?: CourseIdentifierFallback | null) {
  const record = isRecord(value) ? value : null;
  const rawSlug = record
    ? getCourseSlugFromRecord(record, fallback?.slug ?? fallback?.id ?? null)
    : fallback?.slug ?? fallback?.id ?? null;
  const slug = normalizeCourseRouteId(rawSlug);
  const topLevelId = record ? readString(record, ["id", "_id"]) : null;
  const explicitBackendId = record ? getExplicitBackendCourseIdFromRecord(record) : null;
  const normalizedTopLevelId = normalizeCourseRouteId(topLevelId);
  const normalizedFallbackId = normalizeCourseRouteId(fallback?.id ?? null);
  const backendId =
    explicitBackendId ??
    (topLevelId &&
    normalizedTopLevelId !== normalizedFallbackId &&
    normalizedTopLevelId !== slug
      ? topLevelId
      : null) ??
    fallback?.backendId ??
    null;
  const routeId = normalizeCourseRouteId(
    record
      ? getRouteCourseIdFromRecord(record, fallback?.id ?? slug ?? null)
      : fallback?.id ?? slug ?? backendId,
  );

  return {
    backendId,
    slug,
    routeId,
  };
}

function normalizeStudentProgressCacheKey(value: string | null | undefined) {
  const normalizedRouteId = normalizeCourseRouteId(value);

  if (normalizedRouteId) {
    return normalizedRouteId;
  }

  const trimmedValue = value?.trim();
  return trimmedValue || null;
}

function addStudentProgressCacheKey(keys: Set<string>, value: string | null | undefined) {
  const normalizedKey = normalizeStudentProgressCacheKey(value);

  if (normalizedKey) {
    keys.add(normalizedKey);
  }
}

function getStudentCourseSourceKeys(
  courseId: string,
  apiCourseId?: string | null,
  source?: unknown,
) {
  const keys = new Set<string>();

  addStudentProgressCacheKey(keys, courseId);
  addStudentProgressCacheKey(keys, apiCourseId);

  if (source) {
    const identifiers = normalizeCourseIdentifiers(source, {
      id: courseId,
      backendId: apiCourseId,
      slug: courseId,
    });

    addStudentProgressCacheKey(keys, identifiers.routeId);
    addStudentProgressCacheKey(keys, identifiers.backendId);
    addStudentProgressCacheKey(keys, identifiers.slug);
  }

  return Array.from(keys);
}

function emitStudentProgressUpdated(reason: string) {
  studentProgressVersion += 1;
  studentProgressSubscribers.forEach((notifySubscriber) => notifySubscriber());

  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(studentProgressUpdatedEvent, {
      detail: {
        reason,
        version: studentProgressVersion,
      },
    }),
  );
}

function subscribeToStudentProgressUpdates(notifySubscriber: () => void) {
  studentProgressSubscribers.add(notifySubscriber);

  return () => {
    studentProgressSubscribers.delete(notifySubscriber);
  };
}

function getStudentProgressVersionSnapshot() {
  return studentProgressVersion;
}

function useStudentProgressVersion(enabled: boolean) {
  const version = useSyncExternalStore(
    subscribeToStudentProgressUpdates,
    getStudentProgressVersionSnapshot,
    getStudentProgressVersionSnapshot,
  );

  return enabled ? version : 0;
}

function rememberStudentCourseSource(
  courseId: string,
  apiCourseId: string | null | undefined,
  source: unknown,
  options: {
    notify?: boolean;
    reason?: string;
    replace?: boolean;
  } = {},
) {
  const keys = getStudentCourseSourceKeys(courseId, apiCourseId, source);

  if (!keys.length) {
    return source;
  }

  const existingSource = keys
    .map((key) => studentCourseSourceByKey.get(key))
    .find((cachedSource) => cachedSource !== undefined);
  const nextSource =
    options.replace || existingSource === undefined
      ? source
      : mergeStudentPayloadIntoSource(existingSource, source);

  keys.forEach((key) => {
    studentCourseSourceByKey.set(key, nextSource);
  });

  if (options.notify) {
    emitStudentProgressUpdated(options.reason ?? "student-progress");
  }

  return nextSource;
}

function getRememberedStudentCourseSource(
  courseId: string,
  apiCourseId?: string | null,
  source?: unknown,
) {
  const keys = getStudentCourseSourceKeys(courseId, apiCourseId, source);

  for (const key of keys) {
    const cachedSource = studentCourseSourceByKey.get(key);

    if (cachedSource !== undefined) {
      return cachedSource;
    }
  }

  return null;
}

function rememberStudentCourseSummarySource(course: CourseSummary, notify = false, replace = !notify) {
  return rememberStudentCourseSource(getCourseRouteId(course), course.backendId ?? course.id, course, {
    notify,
    reason: "student-course-summary",
    replace,
  });
}

function rememberStudentCourseDetailSource(course: Course, notify = false) {
  return rememberStudentCourseSource(getCourseRouteId(course), course.backendId ?? course.id, course, {
    notify,
    reason: "student-course-detail",
    replace: !notify,
  });
}

function rememberStudentCourseSummaries(courses: CourseSummary[], replace = true) {
  courses.forEach((course) => rememberStudentCourseSummarySource(course, false, replace));
}

function applyRememberedStudentCourseSummary(course: CourseSummary) {
  const cachedSource = getRememberedStudentCourseSource(
    getCourseRouteId(course),
    course.backendId ?? course.id,
    course,
  );

  if (!cachedSource) {
    return course;
  }

  return normalizeCourseSummary(mergeStudentPayloadIntoSource(course, cachedSource), course) ?? course;
}

function applyRememberedStudentCourseDetail(course: Course) {
  const cachedSource = getRememberedStudentCourseSource(
    getCourseRouteId(course),
    course.backendId ?? course.id,
    course,
  );

  if (!cachedSource) {
    return course;
  }

  return normalizeCourseDetail(mergeStudentPayloadIntoSource(course, cachedSource), course);
}

function normalizeCourseSource(value: unknown, fallback?: CourseSource | null): CourseSource {
  const record = isRecord(value) ? value : null;
  const source = record ? readString(record, ["source", "_source"]) : null;

  if (source === "backend" || source === "public-preview" || source === "public-fallback") {
    return source;
  }

  return fallback ?? (record ? "backend" : "public-preview");
}

function normalizePublicationState(
  value: unknown,
  fallback?: {
    isPublished?: boolean | null;
    isVisible?: boolean | null;
  } | null,
) {
  const record = isRecord(value) ? combineNestedCourseRecord(value) : null;
  const explicitPublished =
    record
      ? readBoolean(record, ["isPublished", "published"]) ??
        readNestedBoolean(record, ["course"], ["isPublished", "published"])
      : null;
  const explicitVisible =
    record
      ? readBoolean(record, ["isVisible", "visible"]) ??
        readNestedBoolean(record, ["course"], ["isVisible", "visible"])
      : null;
  const status = record
    ? normalizeEnrollmentStatus(readString(record, ["publicationStatus", "status", "state"]))
    : null;
  const visibility = record
    ? normalizeEnrollmentStatus(readString(record, ["visibility", "visibleStatus"]))
    : null;
  const statusPublished =
    status && ["published", "active", "live", "available", "visible"].includes(status)
      ? true
      : status && ["draft", "unpublished", "archived", "hidden", "disabled"].includes(status)
        ? false
        : null;
  const visibilityVisible =
    visibility && ["public", "visible", "published", "active"].includes(visibility)
      ? true
      : visibility && ["private", "hidden", "draft", "archived", "disabled"].includes(visibility)
        ? false
        : null;

  return {
    isPublished: explicitPublished ?? statusPublished ?? fallback?.isPublished ?? null,
    isVisible: explicitVisible ?? visibilityVisible ?? fallback?.isVisible ?? null,
  };
}

function extractCourseArray(payload: unknown) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!isRecord(payload)) {
    return [];
  }

  return (
    readArray(payload, ["courses", "studentCourses", "enrolledCourses", "items", "data", "results"]) ??
    readNestedArray(payload, ["data"], ["courses", "studentCourses", "enrolledCourses", "items", "results"]) ??
    []
  );
}

function extractItemArray(payload: unknown) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!isRecord(payload)) {
    return [];
  }

  return (
    readArray(payload, ["items", "courses", "activity", "activities", "events", "data", "results"]) ??
    readNestedArray(payload, ["data"], ["items", "courses", "activity", "activities", "events", "results"]) ??
    []
  );
}

function parseIdArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }

      if (isRecord(item)) {
        return readString(item, ["lessonId", "id"]);
      }

      return null;
    })
    .filter((item): item is string => Boolean(item));
}

function parseLessonStates(value: unknown): LessonState[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const lessonId = readString(item, ["lessonId", "id"]);

      if (!lessonId) {
        return null;
      }

      const completedAt =
        readString(item, ["completedAt", "completed_at"]) ??
        readNestedString(item, ["progress"], ["completedAt", "completed_at"]);

      return {
        lessonId,
        type: normalizeLessonMode(item.contentMode, item.type ?? item.lessonType),
        isCompleted: Boolean(
          readBoolean(item, ["isCompleted", "completed"]) ??
            readNestedBoolean(item, ["progress"], ["isCompleted", "completed"]) ??
            completedAt,
        ),
        isLocked: Boolean(readBoolean(item, ["isLocked", "locked"])),
        progress: normalizeProgressValues(item.progress),
      };
    })
    .filter((item): item is LessonState => Boolean(item));
}

function parseSectionLessonStates(value: unknown): LessonState[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((section) => {
    if (!isRecord(section)) {
      return [];
    }

    return (readArray(section, ["lessons", "items"]) ?? [])
      .map((lesson) => {
        if (!isRecord(lesson)) {
          return null;
        }

        const lessonId = readString(lesson, ["id", "_id", "lessonId", "slug", "lessonSlug"]);

        if (!lessonId) {
          return null;
        }

        return {
          lessonId,
          type: normalizeLessonMode(lesson.contentMode, lesson.type ?? lesson.lessonType),
          isCompleted: Boolean(
            readBoolean(lesson, ["isCompleted", "completed"]) ??
              readString(lesson, ["completedAt", "completed_at"]),
          ),
          isLocked: Boolean(readBoolean(lesson, ["isLocked", "locked"])),
          progress: normalizeProgressValues(lesson.progress ?? lesson.lessonProgress),
        };
      })
      .filter((item): item is LessonState => Boolean(item));
  });
}

function parseLessonProgressRecord(value: unknown) {
  if (!isRecord(value)) {
    return {};
  }

  return Object.entries(value).reduce<Record<string, LessonProgressValues>>((progressRecord, [id, progress]) => {
    progressRecord[id] = normalizeProgressValues(progress);
    return progressRecord;
  }, {});
}

function extractProgressMetadata(value: unknown): ProgressMetadata {
  const record = combineNestedCourseRecord(value);

  if (!record) {
    return {
      enrollmentStatus: null,
      isEnrolled: false,
      progressPercent: null,
      completedLessonIds: [],
      completedCount: null,
      totalLessons: null,
      currentLessonId: null,
      nextLessonId: null,
      lessonStates: [],
      lessonProgress: {},
      lastAccessedAt: null,
    };
  }

  const enrollmentStatus =
    readString(record, ["enrollmentStatus", "studentEnrollmentStatus"]) ??
    readNestedString(record, ["enrollment", "studentEnrollment"], ["status"]);
  const explicitEnrollment =
    readBoolean(record, ["isEnrolled", "enrolled"]) ??
    readNestedBoolean(record, ["enrollment", "studentEnrollment"], ["isEnrolled", "enrolled"]);
  const progressPercent =
    readNumber(record, ["progressPercent", "completionPercent", "completionPercentage", "percentComplete"]) ??
    readNestedNumber(record, ["progress", "courseProgress"], [
      "percent",
      "progressPercent",
      "completionPercent",
      "completionPercentage",
      "percentComplete",
    ]);
  const topLevelCompletedLessonIds = parseIdArray(
    readArray(record, ["completedLessonIds", "completedLessons"]),
  );
  const nestedCompletedLessonIds = parseIdArray(
    readNestedArray(record, ["progress", "courseProgress"], ["completedLessonIds", "completedLessons"]),
  );
  const explicitLessonStates = parseLessonStates(
    readArray(record, ["lessonStates", "lessonsProgress"]) ??
      readNestedArray(record, ["progress", "courseProgress"], ["lessonStates", "lessonsProgress"]),
  );
  const sectionLessonStates = parseSectionLessonStates(
    readArray(record, ["sections", "modules"]) ??
      readNestedArray(record, ["course", "courseDetails", "courseInfo"], ["sections", "modules"]),
  );
  const lessonStates = [...sectionLessonStates, ...explicitLessonStates];
  const lessonProgress = {
    ...parseLessonProgressRecord(readNestedRecord(record, ["lessonProgress"])),
    ...parseLessonProgressRecord(readNestedRecord(record, ["progress", "courseProgress"])?.lessonProgress),
    ...lessonStates.reduce<Record<string, LessonProgressValues>>((progressRecord, lessonState) => {
      progressRecord[lessonState.lessonId] = lessonState.progress;
      return progressRecord;
    }, {}),
  };

  return {
    enrollmentStatus,
    isEnrolled: explicitEnrollment ?? isEnrolledStatus(enrollmentStatus),
    progressPercent: progressPercent === null ? null : clampPercentage(progressPercent),
    completedLessonIds: Array.from(
      new Set([
        ...topLevelCompletedLessonIds,
        ...nestedCompletedLessonIds,
        ...lessonStates
          .filter((lessonState) => lessonState.isCompleted)
          .map((lessonState) => lessonState.lessonId),
      ]),
    ),
    completedCount:
      readNumber(record, ["completedCount", "completedLessonCount", "completedLessonsCount", "completedLessons"]) ??
      readNestedNumber(record, ["progress", "courseProgress"], [
        "completedCount",
        "completedLessonCount",
        "completedLessonsCount",
        "completedLessons",
      ]),
    totalLessons:
      readNumber(record, ["totalLessons", "lessonCount", "lessonsCount"]) ??
      readNestedNumber(record, ["progress", "courseProgress"], ["totalLessons", "lessonCount", "lessonsCount"]),
    currentLessonId:
      readString(record, ["currentLessonId", "currentLessonID", "currentLessonSlug", "lessonId", "lessonSlug"]) ??
      readNestedString(record, ["currentLesson"], ["id", "lessonId", "slug", "lessonSlug"]) ??
      readNestedString(record, ["progress", "courseProgress"], [
        "currentLessonId",
        "currentLessonID",
        "currentLessonSlug",
      ]),
    nextLessonId:
      readString(record, ["nextLessonId", "nextLessonID", "nextLessonSlug", "lessonId", "lessonSlug"]) ??
      readNestedString(record, ["nextLesson"], ["id", "lessonId", "slug", "lessonSlug"]) ??
      readNestedString(record, ["progress", "courseProgress"], [
        "nextLessonId",
        "nextLessonID",
        "nextLessonSlug",
      ]),
    lessonStates,
    lessonProgress,
    lastAccessedAt:
      readString(record, ["lastAccessedAt", "updatedAt", "progressUpdatedAt"]) ??
      readNestedString(record, ["progress", "courseProgress"], ["lastAccessedAt", "updatedAt"]),
  };
}

function buildLessonRouteIdMap(lessons: NormalizedLessonInput[]) {
  const routeIdByIdentifier = new Map<string, string>();

  lessons.forEach((lesson) => {
    [lesson.id, lesson.slug, lesson.backendId].forEach((identifier) => {
      const normalizedIdentifier = normalizeRouteValue(identifier);

      if (normalizedIdentifier) {
        routeIdByIdentifier.set(normalizedIdentifier, lesson.id);
      }
    });
  });

  return routeIdByIdentifier;
}

function mapLessonIdentifier(
  identifier: string | null,
  routeIdByIdentifier: Map<string, string>,
) {
  const normalizedIdentifier = normalizeRouteValue(identifier);

  if (!normalizedIdentifier) {
    return identifier;
  }

  return routeIdByIdentifier.get(normalizedIdentifier) ?? identifier;
}

function remapProgressMetadata(
  metadata: ProgressMetadata,
  lessons: NormalizedLessonInput[],
): ProgressMetadata {
  const routeIdByIdentifier = buildLessonRouteIdMap(lessons);

  if (!routeIdByIdentifier.size) {
    return metadata;
  }

  const lessonStates = metadata.lessonStates.map((lessonState) => ({
    ...lessonState,
    lessonId: mapLessonIdentifier(lessonState.lessonId, routeIdByIdentifier) ?? lessonState.lessonId,
  }));
  const lessonProgress = Object.entries(metadata.lessonProgress).reduce<Record<string, LessonProgressValues>>(
    (progressRecord, [lessonId, progress]) => {
      progressRecord[mapLessonIdentifier(lessonId, routeIdByIdentifier) ?? lessonId] = progress;
      return progressRecord;
    },
    {},
  );

  return {
    ...metadata,
    completedLessonIds: Array.from(
      new Set(
        metadata.completedLessonIds.map(
          (lessonId) => mapLessonIdentifier(lessonId, routeIdByIdentifier) ?? lessonId,
        ),
      ),
    ),
    currentLessonId: mapLessonIdentifier(metadata.currentLessonId, routeIdByIdentifier),
    nextLessonId: mapLessonIdentifier(metadata.nextLessonId, routeIdByIdentifier),
    lessonStates,
    lessonProgress,
  };
}

function getProgressFromVerification(verification: LessonCompletionVerification): LessonProgressValues {
  const requiresText = verification.lessonType === "TEXT" || verification.lessonType === "HYBRID";
  const requiresVideo = verification.lessonType === "VIDEO" || verification.lessonType === "HYBRID";

  return {
    scroll: requiresText
      ? Math.max(clampPercentage(verification.progress.scroll), completedTextScrollPercent)
      : 0,
    watch: requiresVideo ? clampPercentage(verification.progress.watch) : 0,
    readingTime: requiresText
      ? Math.max(clampReadingTime(verification.progress.readingTime), completedReadingTimeSeconds)
      : 0,
  };
}

function buildLessonProgressPostPayload(
  progress: LessonProgressValues,
  completed: boolean,
  lessonType: LessonType,
): LessonProgressPostPayload {
  const lessonMode = normalizeLessonMode(null, lessonType);
  const requiresText = lessonMode === "TEXT" || lessonMode === "HYBRID";
  const requiresVideo = lessonMode === "VIDEO" || lessonMode === "HYBRID";
  const payload: LessonProgressPostPayload = {
    completed,
  };

  if (requiresText) {
    payload.scrollPercent = clampPercentage(progress.scroll);
    payload.readingTimeSeconds = clampReadingTime(progress.readingTime);
  }

  if (requiresVideo) {
    payload.watchPercent = clampPercentage(progress.watch);
  }

  return payload;
}

function hasMeaningfulLessonProgressPayload(payload: LessonProgressPostPayload) {
  return (
    payload.completed ||
    (payload.scrollPercent ?? 0) > 0 ||
    (payload.watchPercent ?? 0) > 0 ||
    (payload.readingTimeSeconds ?? 0) > 0
  );
}

function getLessonProgressPayloadKey(payload: LessonProgressPostPayload) {
  return [
    payload.scrollPercent ?? "",
    payload.watchPercent ?? "",
    payload.readingTimeSeconds ?? "",
    payload.completed ? "1" : "0",
  ].join(":");
}

function mergeLessonProgressValues(
  baseProgress: LessonProgressValues,
  progressPatch: Partial<LessonProgressValues>,
): LessonProgressValues {
  return normalizeProgressValues({
    scroll: progressPatch.scroll ?? baseProgress.scroll,
    watch: progressPatch.watch ?? baseProgress.watch,
    readingTime: progressPatch.readingTime ?? baseProgress.readingTime,
  });
}

function getMissingCompletionRequirements(
  verification: LessonCompletionVerification,
): LessonCompletionRequirementKey[] {
  const missingRequirements: LessonCompletionRequirementKey[] = [];
  const requiresText = verification.lessonType === "TEXT" || verification.lessonType === "HYBRID";
  const requiresVideo = verification.lessonType === "VIDEO" || verification.lessonType === "HYBRID";

  if (
    requiresText &&
    (!verification.requirements.readingTimeSatisfied ||
      verification.progress.readingTime < completedReadingTimeSeconds)
  ) {
    missingRequirements.push("READING_TIME");
  }

  if (
    requiresText &&
    (!verification.requirements.textScrolledToBottom ||
      verification.progress.scroll < completedTextScrollPercent)
  ) {
    missingRequirements.push("TEXT_SCROLL_BOTTOM");
  }

  if (
    requiresVideo &&
    (!verification.requirements.watchThresholdSatisfied ||
      verification.progress.watch < completedWatchPercent)
  ) {
    missingRequirements.push("WATCH_THRESHOLD");
  }

  return missingRequirements;
}

function getErrorMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof StudentApiError) {
    return error.message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallbackMessage;
}

function getProgressErrorMessage(error: unknown) {
  if (error instanceof StudentApiError && error.status === 401) {
    return "Progress could not be saved. Please sign in again.";
  }

  return getErrorMessage(error, "The backend did not record this lesson yet.");
}

function getProgressErrorStateSnapshot({
  enrollmentStatus,
  hasAccess,
  lessonId,
  progress,
}: {
  enrollmentStatus: string | null;
  hasAccess: boolean;
  lessonId: string;
  progress: CourseProgress;
}) {
  return {
    enrolled: progress.isEnrolled,
    enrollmentStatus,
    hasAccess,
    currentLesson: lessonId,
  };
}

export function logEnrollmentError(error: unknown) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  if (error instanceof StudentApiError) {
    console.error("Student enrollment request failed", {
      status: error.status,
      body: error.data,
    });
    return;
  }

  console.error("Student enrollment request failed", error);
}

function hasAlreadyEnrolledSignal(value: unknown) {
  if (typeof value === "string") {
    return /already\s+enrolled|enrollment\s+already|already\s+active/i.test(value);
  }

  if (Array.isArray(value)) {
    return value.some(hasAlreadyEnrolledSignal);
  }

  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).some(hasAlreadyEnrolledSignal);
}

function isAlreadyEnrolledError(error: unknown): error is StudentApiError {
  return (
    error instanceof StudentApiError &&
    [200, 400, 409, 422].includes(error.status) &&
    (hasAlreadyEnrolledSignal(error.message) || hasAlreadyEnrolledSignal(error.data))
  );
}

function buildAlreadyEnrolledPayload(error: StudentApiError) {
  return {
    ...(isRecord(error.data) ? error.data : {}),
    enrollmentStatus: "enrolled",
    isEnrolled: true,
  };
}

function getLessonIdsFromSections(sections: CourseSection[]) {
  return sections
    .flatMap((section) => section.lessons)
    .sort((firstLesson, secondLesson) => firstLesson.order - secondLesson.order)
    .map((lesson) => lesson.id);
}

function normalizeCourseSummary(value: unknown, fallback?: CourseSummary | null): CourseSummary | null {
  const record = combineNestedCourseRecord(value);
  const identifiers = normalizeCourseIdentifiers(value, fallback);
  const id = identifiers.routeId;
  const source = normalizeCourseSource(value, fallback?.source);
  const publicationState = normalizePublicationState(record ?? value, fallback);

  if (!id && !fallback) {
    return null;
  }

  const metadata = extractProgressMetadata(record ?? fallback);
  const lessonIds = record ? parseIdArray(readArray(record, ["lessonIds"])) : [];
  const routeLessonIds = fallback?.lessonIds.length ? fallback.lessonIds : lessonIds;

  return {
    id: id ?? fallback?.id ?? "course",
    backendId: identifiers.backendId,
    slug: identifiers.slug ?? id ?? fallback?.slug ?? null,
    source,
    title: (record && readString(record, ["title", "name"])) ?? fallback?.title ?? "Course",
    category: (record && readString(record, ["category"])) ?? fallback?.category ?? "Cybersecurity",
    shortDescription:
      (record && readString(record, ["shortDescription", "summary", "description"])) ??
      fallback?.shortDescription ??
      "Cybersecurity training course.",
    difficulty: normalizeDifficulty(record?.difficulty, fallback?.difficulty),
    tone: normalizeTone(record?.tone, fallback?.tone),
    hasLabs: Boolean((record && readBoolean(record, ["hasLabs"])) ?? fallback?.hasLabs ?? false),
    ...publicationState,
    lessonCount:
      Math.round(
        (record && readNumber(record, ["lessonCount", "lessonsCount", "totalLessons"])) ??
          metadata.totalLessons ??
          fallback?.lessonCount ??
          routeLessonIds.length,
      ) || 0,
    sectionCount:
      Math.round((record && readNumber(record, ["sectionCount", "sectionsCount"])) ?? fallback?.sectionCount ?? 0) || 0,
    durationMinutes:
      Math.round((record && readNumber(record, ["durationMinutes", "duration"])) ?? fallback?.durationMinutes ?? 0) || 0,
    lessonTypes: fallback?.lessonTypes ?? [],
    lessonIds: routeLessonIds,
    ...metadata,
  };
}

function normalizeArticleContent(value: unknown, fallback: string[]) {
  if (Array.isArray(value)) {
    const paragraphs = value.filter(
      (item): item is string => typeof item === "string" && Boolean(item.trim()),
    );

    if (paragraphs.length) {
      return paragraphs;
    }
  }

  if (typeof value === "string" && value.trim()) {
    return value
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean);
  }

  return fallback;
}

function normalizeLesson(value: unknown, fallback?: CourseLesson | null): CourseLesson | null {
  if (!isRecord(value) && !fallback) {
    return null;
  }

  const record = isRecord(value) ? value : null;
  const normalizedContentMode = record ? readLessonTypeValue(record.contentMode) : fallback?.contentMode ?? null;
  const normalizedType = record ? readLessonTypeValue(record.type) : fallback?.type ?? null;
  const fallbackMode = fallback ? normalizeLessonMode(fallback.contentMode, fallback.type) : "TEXT";
  const lessonMode = normalizedContentMode ?? normalizedType ?? fallbackMode;
  const slug = record
    ? readString(record, ["slug", "lessonSlug", "publicId", "publicSlug", "routeId"])
    : null;
  const backendId = record ? readString(record, ["backendId", "id", "_id", "lessonId"]) : null;
  const id = fallback?.id ?? slug ?? backendId ?? null;

  if (!id) {
    return null;
  }

  const mediaRecord = record?.media;
  const videoFromMedia = isRecord(mediaRecord) ? mediaRecord.video : null;
  const video = record?.video ?? videoFromMedia ?? fallback?.video ?? null;
  const protectedMedia =
    record?.protectedMedia ??
    record?.protectedSession ??
    fallback?.protectedMedia ??
    null;
  const quizRecord = isRecord(record?.quiz) ? record.quiz : null;
  const articleContent = normalizeArticleContent(
    record?.textContent ?? record?.text ?? record?.articleContent ?? record?.content ?? record?.body,
    fallback?.articleContent ?? [],
  );

  return {
    id,
    backendId: backendId && backendId !== id ? backendId : fallback?.backendId ?? null,
    slug: slug ?? fallback?.slug ?? null,
    title: (record && readString(record, ["title", "name"])) ?? fallback?.title ?? "Lesson",
    type: normalizedType ?? lessonMode,
    contentMode: normalizedContentMode,
    text:
      (record && readString(record, ["textContent", "text"])) ??
      fallback?.text ??
      (articleContent.length ? articleContent.join("\n\n") : null),
    video,
    protectedMedia,
    media:
      record?.media ??
      record?.video ??
      record?.mediaMetadata ??
      record?.videoMetadata ??
      record?.protectedMedia ??
      record?.protectedSession ??
      fallback?.media ??
      null,
    hasQuiz:
      (record && readBoolean(record, ["hasQuiz", "quizAvailable"])) ??
      (quizRecord && readBoolean(quizRecord, ["hasQuiz"])) ??
      fallback?.hasQuiz ??
      null,
    quizId:
      (record && readString(record, ["quizId", "quizID"])) ??
      (quizRecord && readString(quizRecord, ["id", "quizId"])) ??
      fallback?.quizId ??
      null,
    quizPassed:
      (record && readBoolean(record, ["quizPassed", "hasPassedQuiz"])) ??
      fallback?.quizPassed ??
      null,
    durationMinutes:
      Math.round((record && readNumber(record, ["durationMinutes", "duration"])) ?? fallback?.durationMinutes ?? 0) || 0,
    order: Math.round((record && readNumber(record, ["order", "position"])) ?? fallback?.order ?? 0) || 0,
    isLocked: (record && readBoolean(record, ["isLocked", "locked"])) ?? fallback?.isLocked ?? null,
    summary: (record && readString(record, ["summary", "description"])) ?? fallback?.summary ?? "",
    articleContent,
  };
}

function findFallbackSection(
  section: Record<string, unknown>,
  sectionIndex: number,
  fallbackSections: CourseSection[],
) {
  const sectionId = readString(section, ["id", "sectionId"]);
  const sectionTitle = normalizeMatchKey(readString(section, ["title", "name"]));

  return (
    fallbackSections.find((fallbackSection) => fallbackSection.id === sectionId) ??
    fallbackSections.find((fallbackSection) => normalizeMatchKey(fallbackSection.title) === sectionTitle) ??
    fallbackSections.find((fallbackSection) => fallbackSection.order === sectionIndex + 1) ??
    fallbackSections[sectionIndex] ??
    null
  );
}

function findFallbackLesson(
  lesson: unknown,
  lessonIndex: number,
  fallbackLessons: CourseLesson[],
) {
  const record = isRecord(lesson) ? lesson : null;
  const lessonId = record ? readString(record, ["id", "_id", "lessonId", "slug", "lessonSlug"]) : null;
  const lessonTitle = record ? normalizeMatchKey(readString(record, ["title", "name"])) : null;
  const order = record ? readNumber(record, ["order", "position"]) : null;

  return (
    fallbackLessons.find((fallbackLesson) => lessonMatchesIdentifier(fallbackLesson, lessonId)) ??
    fallbackLessons.find((fallbackLesson) => normalizeMatchKey(fallbackLesson.title) === lessonTitle) ??
    fallbackLessons.find((fallbackLesson) => fallbackLesson.order === order) ??
    fallbackLessons[lessonIndex] ??
    null
  );
}

function normalizeSections(value: unknown, fallbackSections: CourseSection[]) {
  if (!Array.isArray(value)) {
    return fallbackSections;
  }

  const sections = value
    .map((item, sectionIndex) => {
      if (!isRecord(item)) {
        return null;
      }
      const fallbackSection = findFallbackSection(item, sectionIndex, fallbackSections);

      const lessons = Array.isArray(item.lessons)
        ? item.lessons
            .map((lesson, lessonIndex) =>
              normalizeLesson(
                lesson,
                findFallbackLesson(lesson, lessonIndex, fallbackSection?.lessons ?? []) ?? {
                  id: `lesson-${lessonIndex + 1}`,
                  title: "Lesson",
                  type: "TEXT",
                  durationMinutes: 0,
                  order: lessonIndex + 1,
                  summary: "",
                  articleContent: [],
                },
              ),
            )
            .filter((lesson): lesson is CourseLesson => Boolean(lesson))
        : fallbackSection?.lessons ?? [];

      return {
        id: fallbackSection?.id ?? readString(item, ["id", "sectionId"]) ?? `section-${sectionIndex + 1}`,
        title: readString(item, ["title", "name"]) ?? fallbackSection?.title ?? `Section ${sectionIndex + 1}`,
        description: readString(item, ["description", "summary"]) ?? fallbackSection?.description ?? "",
        order: Math.round(readNumber(item, ["order", "position"]) ?? fallbackSection?.order ?? sectionIndex + 1),
        lessons,
      };
    })
    .filter((item): item is CourseSection => Boolean(item));

  return sections.length ? sections : fallbackSections;
}

function extractLessonRecord(payload: unknown) {
  if (!isRecord(payload)) {
    return null;
  }

  return readNestedRecord(payload, ["lesson", "currentLesson"]) ?? payload;
}

function getLessonAccessDeniedReason(payload: unknown) {
  if (readBooleanDeep(payload, ["requiresEnrollment", "requires_enrollment"]) === true) {
    return "requiresEnrollment";
  }

  if (readBooleanDeep(payload, ["accessDenied", "access_denied"]) === true) {
    return "accessDenied";
  }

  return null;
}

function getExplicitLessonLocked(payload: unknown) {
  const lessonRecord = extractLessonRecord(payload);

  return (
    (lessonRecord ? readBoolean(lessonRecord, ["isLocked", "locked"]) : null) ??
    readBooleanDeep(payload, ["isLocked", "locked"])
  );
}

function getLessonByIdentifier(course: Course, lessonId: string) {
  return (
    course.sections
      .flatMap((section) => section.lessons)
      .find((lesson) => lessonMatchesIdentifier(lesson, lessonId)) ?? null
  );
}

function lessonHasDisplayContent(lesson: CourseLesson | null) {
  return Boolean(
    lesson &&
      (lesson.articleContent.length > 0 ||
        lesson.summary.trim().length > 0 ||
        lesson.title.trim().length > 0),
  );
}

function getLessonIdentifierSet(course: Course, lessonId: string) {
  const lesson = getLessonByIdentifier(course, lessonId);
  const identifiers = [lessonId, lesson?.id, lesson?.slug, lesson?.backendId]
    .map((identifier) => normalizeRouteValue(identifier))
    .filter((identifier): identifier is string => Boolean(identifier));

  return new Set(identifiers);
}

function lessonStateMatchesIdentifier(lessonState: LessonState, identifiers: Set<string>) {
  const normalizedLessonId = normalizeRouteValue(lessonState.lessonId);
  return Boolean(normalizedLessonId && identifiers.has(normalizedLessonId));
}

function forceLessonAccessAllowed(course: Course, lessonId: string): Course {
  const identifiers = getLessonIdentifierSet(course, lessonId);
  const targetLesson = getLessonByIdentifier(course, lessonId);
  const lessonStates = course.lessonStates ?? [];
  const hasTargetLessonState = lessonStates.some((lessonState) =>
    lessonStateMatchesIdentifier(lessonState, identifiers),
  );
  const nextLessonStates = lessonStates.map((lessonState) =>
    lessonStateMatchesIdentifier(lessonState, identifiers)
      ? {
          ...lessonState,
          isLocked: false,
        }
      : lessonState,
  );

  if (targetLesson && !hasTargetLessonState) {
    nextLessonStates.push({
      lessonId: targetLesson.id,
      type: normalizeLessonMode(targetLesson.contentMode, targetLesson.type),
      isCompleted: false,
      isLocked: false,
      progress: normalizeProgressValues(null),
    });
  }

  return {
    ...course,
    enrollmentStatus: isEnrolledStatus(course.enrollmentStatus ?? null) === false
      ? "active"
      : course.enrollmentStatus ?? "active",
    isEnrolled: true,
    lessonStates: nextLessonStates,
    sections: course.sections.map((section) => ({
      ...section,
      lessons: section.lessons.map((lesson) =>
        lessonMatchesIdentifier(lesson, lessonId)
          ? {
              ...lesson,
              isLocked: false,
            }
          : lesson,
      ),
    })),
  };
}

function mergeLessonIntoCourse(course: Course, payload: unknown, lessonId: string): Course {
  const lessonRecord = extractLessonRecord(payload);
  const replacementLesson = normalizeLesson(
    lessonRecord,
    course.sections.flatMap((section) => section.lessons).find((lesson) =>
      lessonMatchesIdentifier(lesson, lessonId),
    ),
  );

  if (!replacementLesson) {
    return course;
  }

  return {
    ...course,
    sections: course.sections.map((section) => ({
      ...section,
      lessons: section.lessons.map((lesson) =>
        lessonMatchesIdentifier(lesson, replacementLesson.id) ||
        lessonMatchesIdentifier(lesson, lessonId)
          ? replacementLesson
          : lesson,
      ),
    })),
  };
}

function normalizeCourseDetail(value: unknown, fallbackCourse: Course): Course {
  const record = combineNestedCourseRecord(value);
  const identifiers = normalizeCourseIdentifiers(value, fallbackCourse);
  const sections = normalizeSections(record?.sections, fallbackCourse.sections);
  const lessonInputs = sections.flatMap((section) =>
    section.lessons.map((lesson) => ({
      id: lesson.id,
      backendId: lesson.backendId,
      slug: lesson.slug,
      type: normalizeLessonMode(lesson.contentMode, lesson.type),
    })),
  );
  const metadata = remapProgressMetadata(extractProgressMetadata(record ?? fallbackCourse), lessonInputs);
  const publicationState = normalizePublicationState(record ?? value, fallbackCourse);

  return {
    ...fallbackCourse,
    id: identifiers.routeId ?? getCourseRouteId(fallbackCourse),
    backendId: identifiers.backendId,
    slug: identifiers.slug ?? identifiers.routeId ?? fallbackCourse.slug ?? fallbackCourse.id,
    source: normalizeCourseSource(value, fallbackCourse.source),
    title: (record && readString(record, ["title", "name"])) ?? fallbackCourse.title,
    category: (record && readString(record, ["category"])) ?? fallbackCourse.category,
    shortDescription:
      (record && readString(record, ["shortDescription", "summary", "description"])) ??
      fallbackCourse.shortDescription,
    fullDescription:
      (record && readString(record, ["fullDescription", "description"])) ?? fallbackCourse.fullDescription,
    difficulty: normalizeDifficulty(record?.difficulty, fallbackCourse.difficulty),
    tone: normalizeTone(record?.tone, fallbackCourse.tone),
    hasLabs: Boolean((record && readBoolean(record, ["hasLabs"])) ?? fallbackCourse.hasLabs),
    ...publicationState,
    sections,
    ...metadata,
    totalLessons: metadata.totalLessons ?? getLessonIdsFromSections(sections).length,
  };
}

function mergeStudentPayloadIntoSource(currentSource: unknown, payload: unknown) {
  const currentRecord = combineNestedCourseRecord(currentSource) ?? {};
  const payloadRecord = combineNestedCourseRecord(payload) ?? {};
  const currentIdentifiers = normalizeCourseIdentifiers(currentSource);
  const identifiers = normalizeCourseIdentifiers(payload, {
    id: currentIdentifiers.routeId,
    backendId: currentIdentifiers.backendId,
    slug: currentIdentifiers.slug,
  });

  return {
    ...currentRecord,
    ...payloadRecord,
    id: identifiers.routeId ?? currentRecord.id,
    backendId: identifiers.backendId,
    slug: identifiers.slug,
  };
}

function buildLessonStates(
  lessons: NormalizedLessonInput[],
  metadata: ProgressMetadata,
  isEnrolled: boolean,
  forceCompleted = false,
) {
  const completedLessonSet = new Set(metadata.completedLessonIds);
  const backendStateById = new Map(metadata.lessonStates.map((lessonState) => [lessonState.lessonId, lessonState]));
  const useCompletedCountFallback =
    metadata.completedLessonIds.length === 0 &&
    metadata.lessonStates.every((lessonState) => !lessonState.isCompleted) &&
    metadata.completedCount !== null;
  const completedCountFallback = Math.max(
    0,
    Math.min(Math.round(metadata.completedCount ?? 0), lessons.length),
  );
  let previousLessonsComplete = true;

  return lessons.map((lesson, lessonIndex) => {
    const backendState = backendStateById.get(lesson.id);
    const isCompleted =
      forceCompleted ||
      backendState?.isCompleted ||
      completedLessonSet.has(lesson.id) ||
      (useCompletedCountFallback && lessonIndex < completedCountFallback);
    const backendLocked = backendState ? backendState.isLocked : lesson.isLocked ?? null;
    const isLocked =
      forceCompleted
        ? false
        : !isEnrolled || (backendLocked ?? !previousLessonsComplete);
    const progress = metadata.lessonProgress[lesson.id] ?? backendState?.progress ?? normalizeProgressValues(null);

    if (!isCompleted) {
      previousLessonsComplete = false;
    }

    return {
      lessonId: lesson.id,
      type: backendState?.type ?? lesson.type,
      isCompleted,
      isLocked,
      progress,
    };
  });
}

function getLessonProgressRecord(lessonStates: LessonState[]) {
  return lessonStates.reduce<Record<string, LessonProgressValues>>((lessonProgress, lessonState) => {
    lessonProgress[lessonState.lessonId] = lessonState.progress;
    return lessonProgress;
  }, {});
}

export function normalizeStudentCourseProgress(
  courseId: string,
  lessonInputs: CourseProgressLessonInput[],
  source?: unknown,
): CourseProgress {
  const normalizedLessons = normalizeLessonInputs(lessonInputs);
  const metadata = remapProgressMetadata(extractProgressMetadata(source), normalizedLessons);
  const progressImpliesEnrollment = (metadata.progressPercent ?? 0) > 0 || metadata.completedLessonIds.length > 0;
  const isEnrolled = Boolean(metadata.isEnrolled ?? progressImpliesEnrollment);
  const totalLessons = Math.round(metadata.totalLessons ?? normalizedLessons.length);
  const forceCompleted =
    totalLessons > 0 &&
    ((metadata.progressPercent ?? 0) >= 100 ||
      (metadata.completedCount !== null && metadata.completedCount >= totalLessons));
  const lessonStates = buildLessonStates(normalizedLessons, metadata, isEnrolled, forceCompleted);
  const completedLessonIds = Array.from(
    new Set(
      lessonStates
        .filter((lessonState) => lessonState.isCompleted)
        .map((lessonState) => lessonState.lessonId),
    ),
  );
  const completedCount = forceCompleted ? totalLessons : Math.round(metadata.completedCount ?? completedLessonIds.length);
  const computedProgressPercent = totalLessons ? Math.round((completedCount / totalLessons) * 100) : 0;
  const progressPercent = metadata.progressPercent ?? computedProgressPercent;
  const isCompleted = totalLessons > 0 && progressPercent >= 100;
  const firstUnlockedIncompleteLessonId =
    lessonStates.find((lessonState) => !lessonState.isCompleted && !lessonState.isLocked)?.lessonId ?? null;
  const backendTargetLessonId = metadata.nextLessonId ?? metadata.currentLessonId;
  const backendTargetLesson = backendTargetLessonId
    ? normalizedLessons.find((lesson) => lessonMatchesIdentifier(lesson, backendTargetLessonId))
    : null;
  const backendTargetState = backendTargetLesson
    ? lessonStates.find((lessonState) => lessonState.lessonId === backendTargetLesson.id)
    : null;
  const nextLessonId =
    isEnrolled && backendTargetLesson && backendTargetState?.isLocked !== true && backendTargetState?.isCompleted !== true
      ? backendTargetLesson.id
      : isEnrolled
        ? firstUnlockedIncompleteLessonId
        : null;
  const currentLessonId =
    isEnrolled &&
    backendTargetLesson &&
    backendTargetState?.isLocked !== true &&
    backendTargetState?.isCompleted !== true
      ? backendTargetLesson.id
      : nextLessonId;

  return {
    courseId,
    isEnrolled,
    isCompleted,
    completedLessonIds,
    completedCount,
    totalLessons,
    progressPercent,
    currentLessonId,
    nextLessonId,
    lessonStates,
    lessonProgress: getLessonProgressRecord(lessonStates),
  };
}

export function buildCourseProgress(
  courseId: string,
  lessonInputs: CourseProgressLessonInput[],
  source?: unknown,
): CourseProgress {
  return normalizeStudentCourseProgress(courseId, lessonInputs, source);
}

function recordConfirmsLessonCompletion(record: Record<string, unknown> | null) {
  if (!record) {
    return false;
  }

  return (
    readBoolean(record, ["isCompleted", "completed"]) === true ||
    Boolean(readString(record, ["completedAt", "completed_at"]))
  );
}

function getNestedRecord(record: Record<string, unknown> | null, key: string) {
  if (!record) {
    return null;
  }

  const value = record[key];
  return isRecord(value) ? value : null;
}

function getMatchingLessonProgressRecord(
  lessonProgressRecord: Record<string, unknown> | null,
  lessonId: string,
  lessonInputs: CourseProgressLessonInput[],
) {
  if (!lessonProgressRecord) {
    return null;
  }

  const targetLesson = normalizeLessonInputs(lessonInputs).find((lesson) =>
    lessonMatchesIdentifier(lesson, lessonId),
  );

  if (!targetLesson) {
    return null;
  }

  const matchingEntry = Object.entries(lessonProgressRecord).find(([progressLessonId]) =>
    lessonMatchesIdentifier(targetLesson, progressLessonId),
  );

  return matchingEntry && isRecord(matchingEntry[1]) ? matchingEntry[1] : null;
}

function lessonCompletionConfirmed(
  payload: unknown,
  courseId: string,
  lessonId: string,
  lessonInputs: CourseProgressLessonInput[],
) {
  if (isRecord(payload)) {
    const lessonRecord = getNestedRecord(payload, "lesson");
    const progressRecord = getNestedRecord(payload, "progress");
    const directLessonProgressRecord = getNestedRecord(payload, "lessonProgress");
    const nestedLessonProgressRecord = getNestedRecord(progressRecord, "lessonProgress");
    const lessonNestedProgressRecord =
      getNestedRecord(lessonRecord, "progress") ?? getNestedRecord(lessonRecord, "lessonProgress");
    const matchingLessonProgressRecord =
      getMatchingLessonProgressRecord(directLessonProgressRecord, lessonId, lessonInputs) ??
      getMatchingLessonProgressRecord(nestedLessonProgressRecord, lessonId, lessonInputs);

    if (
      [
        payload,
        lessonRecord,
        progressRecord,
        directLessonProgressRecord,
        nestedLessonProgressRecord,
        lessonNestedProgressRecord,
        matchingLessonProgressRecord,
      ].some(recordConfirmsLessonCompletion)
    ) {
      return true;
    }
  }

  return buildCourseProgress(courseId, lessonInputs, payload).completedLessonIds.includes(lessonId);
}

function buildConfirmedLessonCompletionPayload(
  payload: unknown,
  lessonId: string,
  lessonType: LessonType,
  progress: LessonProgressValues,
) {
  const payloadRecord = isRecord(payload) ? payload : {};
  const metadata = extractProgressMetadata(payloadRecord);
  const matchingLesson = normalizeLessonInputs([{ id: lessonId, type: lessonType }])[0];
  const nextLessonStates = metadata.lessonStates.filter(
    (lessonState) => !lessonMatchesIdentifier(matchingLesson, lessonState.lessonId),
  );
  const directLessonProgress = getNestedRecord(payloadRecord, "lessonProgress") ?? {};

  return {
    ...payloadRecord,
    lessonProgress: {
      ...directLessonProgress,
      [lessonId]: progress,
    },
    lessonStates: [
      ...nextLessonStates,
      {
        lessonId,
        type: lessonType,
        isCompleted: true,
        isLocked: false,
        progress,
      },
    ],
  };
}

function buildEnrollmentRoutePayload(enrollmentPayload: unknown, coursePayload: unknown) {
  const courseRecord = combineNestedCourseRecord(coursePayload);

  if (!courseRecord) {
    return enrollmentPayload;
  }

  return {
    ...courseRecord,
    courseDetail: coursePayload,
    enrollment: enrollmentPayload,
  };
}

function getNestedPayloadRecords(payload: unknown) {
  if (!isRecord(payload)) {
    return [];
  }

  return [
    readNestedRecord(payload, ["enrollment", "enrollmentPayload", "enrollmentResult"]),
    readNestedRecord(payload, ["data", "result", "payload"]),
  ].filter((item): item is Record<string, unknown> => Boolean(item));
}

function getPayloadLessonIds(payload: unknown, seen = new Set<unknown>()): string[] {
  if (!isRecord(payload)) {
    return [];
  }

  if (seen.has(payload)) {
    return [];
  }

  seen.add(payload);

  const directLessonId = readString(payload, [
    "lessonSlug",
    "publicLessonSlug",
    "lessonPublicSlug",
    "firstUnlockedLessonSlug",
    "unlockedLessonSlug",
    "startLessonSlug",
    "startingLessonSlug",
    "currentLessonSlug",
    "nextLessonSlug",
    "firstUnlockedLessonId",
    "firstUnlockedLessonID",
    "unlockedLessonId",
    "unlockedLessonID",
    "startLessonId",
    "startingLessonId",
    "lessonId",
    "lessonID",
    "firstLessonId",
    "firstLessonID",
    "currentLessonId",
    "currentLessonID",
    "nextLessonId",
    "nextLessonID",
  ]);
  const nestedLessonIds = [
    readNestedString(
      payload,
      ["firstUnlockedLesson", "unlockedLesson", "lesson", "firstLesson", "currentLesson", "nextLesson"],
      ["slug", "lessonSlug", "publicSlug", "publicId", "routeId", "id", "_id", "lessonId", "lessonID"],
    ),
    readNestedString(payload, ["course", "progress", "courseProgress"], [
      "firstUnlockedLessonId",
      "unlockedLessonId",
      "lessonId",
      "firstLessonId",
      "currentLessonId",
      "nextLessonId",
    ]),
  ];

  return Array.from(
    new Set([
      directLessonId,
      ...nestedLessonIds,
      ...getNestedPayloadRecords(payload).flatMap((record) => getPayloadLessonIds(record, seen)),
    ].filter((item): item is string => Boolean(item))),
  );
}

function getPayloadLessonSlug(payload: unknown, seen = new Set<unknown>()): string | null {
  if (!isRecord(payload)) {
    return null;
  }

  if (seen.has(payload)) {
    return null;
  }

  seen.add(payload);

  return (
    readString(payload, [
      "lessonSlug",
      "publicLessonSlug",
      "lessonPublicSlug",
      "firstUnlockedLessonSlug",
      "unlockedLessonSlug",
      "startLessonSlug",
      "startingLessonSlug",
      "currentLessonSlug",
      "nextLessonSlug",
    ]) ??
    readNestedString(
      payload,
      ["firstUnlockedLesson", "unlockedLesson", "lesson", "firstLesson", "currentLesson", "nextLesson"],
      ["slug", "lessonSlug", "publicSlug", "publicId", "routeId"],
    ) ??
    getNestedPayloadRecords(payload)
      .map((record) => getPayloadLessonSlug(record, seen))
      .find((slug): slug is string => Boolean(slug)) ??
    null
  );
}

function getPayloadCourseRouteId(payload: unknown, fallbackCourseId: string) {
  if (!isRecord(payload)) {
    return fallbackCourseId;
  }

  return (
    normalizeCourseRouteId(
      readString(payload, ["courseSlug", "publicCourseSlug", "coursePublicSlug"]) ??
        readNestedString(payload, ["enrollment", "enrollmentPayload", "enrollmentResult"], [
          "courseSlug",
          "publicCourseSlug",
          "coursePublicSlug",
        ]) ??
        readNestedString(payload, ["course", "studentCourse", "courseDetail"], [
          "slug",
          "courseSlug",
          "publicSlug",
          "publicId",
          "routeId",
        ]),
    ) ?? fallbackCourseId
  );
}

function toNormalizedLessonInput(lesson: CourseLesson): NormalizedLessonInput {
  return {
    id: lesson.id,
    backendId: lesson.backendId,
    slug: lesson.slug,
    isLocked: lesson.isLocked,
    type: normalizeLessonMode(lesson.contentMode, lesson.type),
  };
}

function extractRouteLessonsFromRecord(record: Record<string, unknown> | null) {
  if (!record) {
    return [];
  }

  const sections = normalizeSections(record.sections, []);

  if (sections.length) {
    return sections
      .sort((firstSection, secondSection) => firstSection.order - secondSection.order)
      .flatMap((section) =>
        [...section.lessons]
          .sort((firstLesson, secondLesson) => firstLesson.order - secondLesson.order)
          .map(toNormalizedLessonInput),
      );
  }

  const lessons = readArray(record, ["lessons", "courseLessons", "items"]);

  if (!lessons) {
    return [];
  }

  return lessons
    .map((lesson, lessonIndex) =>
      normalizeLesson(lesson) ??
      normalizeLesson(lesson, {
        id: `lesson-${lessonIndex + 1}`,
        title: "Lesson",
        type: "TEXT",
        durationMinutes: 0,
        order: lessonIndex + 1,
        summary: "",
        articleContent: [],
      }),
    )
    .filter((lesson): lesson is CourseLesson => Boolean(lesson))
    .sort((firstLesson, secondLesson) => firstLesson.order - secondLesson.order)
    .map(toNormalizedLessonInput);
}

function extractRouteLessonsFromSource(source: unknown, seen = new Set<unknown>()): NormalizedLessonInput[] {
  if (!isRecord(source)) {
    return [];
  }

  if (seen.has(source)) {
    return [];
  }

  seen.add(source);

  const directRecord = combineNestedCourseRecord(source);
  const directLessons = extractRouteLessonsFromRecord(directRecord);

  if (directLessons.length) {
    return directLessons;
  }

  for (const nestedRecord of [
    readNestedRecord(source, ["courseDetail", "courseDetails", "courseInfo"]),
    ...getNestedPayloadRecords(source),
  ]) {
    const nestedLessons = extractRouteLessonsFromSource(nestedRecord, seen);

    if (nestedLessons.length) {
      return nestedLessons;
    }
  }

  return [];
}

function getSafeRoutingLessons(
  lessonInputs: CourseProgressLessonInput[],
  payload: unknown,
  source: unknown,
) {
  const inputLessons = normalizeLessonInputs(lessonInputs);

  if (inputLessons.some((lesson) => getLessonRouteSlug(lesson))) {
    return inputLessons;
  }

  const payloadLessons = extractRouteLessonsFromSource(payload);

  if (payloadLessons.length) {
    return payloadLessons;
  }

  const sourceLessons = extractRouteLessonsFromSource(source);

  if (sourceLessons.length) {
    return sourceLessons;
  }

  return inputLessons;
}

function isUnsafeLessonRouteValue(value: string | null | undefined) {
  const normalizedValue = normalizeRouteValue(value);

  if (!normalizedValue) {
    return true;
  }

  return (
    normalizedValue.startsWith("legacy-") ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(normalizedValue)
  );
}

function getLessonRouteSlug(lesson: NormalizedLessonInput | null | undefined) {
  const slug = lesson?.slug?.trim();
  const id = lesson?.id?.trim();

  if (slug && !isUnsafeLessonRouteValue(slug)) {
    return slug;
  }

  if (id && !isUnsafeLessonRouteValue(id)) {
    return id;
  }

  return null;
}

function getLessonRouteIdentifiers(lesson: NormalizedLessonInput | null | undefined) {
  return [lesson?.id, lesson?.slug, lesson?.backendId].filter((identifier): identifier is string =>
    Boolean(identifier),
  );
}

function findMatchingRouteLesson(
  lessons: NormalizedLessonInput[],
  identifiers: Array<string | null | undefined>,
) {
  return lessons.find((lesson) =>
    identifiers.some((identifier) => lessonMatchesIdentifier(lesson, identifier)),
  ) ?? null;
}

function resolveLessonRouteTarget(
  lesson: NormalizedLessonInput | null | undefined,
  lessons: NormalizedLessonInput[],
  identifiers: Array<string | null | undefined> = [],
) {
  const routeIdentifiers = [...identifiers, ...getLessonRouteIdentifiers(lesson)];
  const directRouteValue = getLessonRouteSlug(lesson);

  if (directRouteValue) {
    return {
      lesson: lesson ?? null,
      resolvedRouteValue: directRouteValue,
    };
  }

  const matchingLesson = findMatchingRouteLesson(lessons, routeIdentifiers);
  const matchedRouteValue = getLessonRouteSlug(matchingLesson);

  return {
    lesson: matchingLesson ?? lesson ?? null,
    resolvedRouteValue: matchedRouteValue,
  };
}

function logLessonRouteTarget({
  courseSlug,
  href,
  lesson,
  resolvedRouteValue,
  source,
}: {
  courseSlug: string;
  href: string;
  lesson: NormalizedLessonInput | null;
  resolvedRouteValue: string | null;
  source: string;
}) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.log("[LESSON_ROUTE_TARGET]", {
    courseSlug,
    lessonId: lesson?.id,
    lessonSlug: lesson?.slug,
    resolvedRouteValue,
    source,
    href,
  });
}

function getExplicitLessonStates(source: unknown, lessons: NormalizedLessonInput[]) {
  return remapProgressMetadata(extractProgressMetadata(source), lessons).lessonStates;
}

function getFirstExplicitUnlockedLessonId(source: unknown, lessons: NormalizedLessonInput[]) {
  const unlockedLessonIds = new Set(
    getExplicitLessonStates(source, lessons)
      .filter((lessonState) => lessonState.isLocked === false)
      .map((lessonState) => lessonState.lessonId),
  );

  return lessons.find((lesson) => unlockedLessonIds.has(lesson.id) || lesson.isLocked === false)?.id ?? null;
}

function isKnownLockedLesson(
  lessonId: string,
  sources: unknown[],
  lessons: NormalizedLessonInput[],
) {
  if (lessons.find((lesson) => lesson.id === lessonId)?.isLocked === true) {
    return true;
  }

  return sources.some((source) =>
    getExplicitLessonStates(source, lessons).some(
      (lessonState) => lessonState.lessonId === lessonId && lessonState.isLocked === true,
    ),
  );
}

export function getEnrollmentLessonHref(
  courseId: string,
  payload: unknown,
  fallbackLessonId: string | null,
  lessonInputs: CourseProgressLessonInput[] = [],
  source?: unknown,
) {
  return (
    getSafeEnrollmentLessonHref(courseId, payload, fallbackLessonId, lessonInputs, source) ??
    `/courses/${courseId}`
  );
}

export function getSafeLessonHref(
  courseId: string,
  lessonInput: CourseProgressLessonInput,
  lessonInputs: CourseProgressLessonInput[] = [],
) {
  const [lesson] = normalizeLessonInputs([lessonInput]);
  const lessons = normalizeLessonInputs(lessonInputs);
  const matchingLesson = findMatchingRouteLesson(lessons, getLessonRouteIdentifiers(lesson)) ?? lesson;
  const { lesson: resolvedLesson, resolvedRouteValue } = resolveLessonRouteTarget(
    matchingLesson,
    lessons,
    getLessonRouteIdentifiers(lesson),
  );

  const href = resolvedRouteValue
    ? `/courses/${courseId}/lessons/${resolvedRouteValue}`
    : `/courses/${courseId}`;

  const source = resolvedRouteValue ? "safe-lesson" : "safe-lesson-fallback";

  logLessonRouteTarget({
    courseSlug: courseId,
    lesson: resolvedLesson,
    resolvedRouteValue,
    source,
    href,
  });

  return href;
}

export function getSafeEnrollmentLessonHref(
  courseId: string,
  payload: unknown,
  fallbackLessonId: string | null,
  lessonInputs: CourseProgressLessonInput[] = [],
  source?: unknown,
) {
  const courseRouteId = getPayloadCourseRouteId(payload ?? source, courseId);
  const courseHref = `/courses/${courseRouteId}`;
  const directLessonSlug = getPayloadLessonSlug(payload);
  const lessons = getSafeRoutingLessons(lessonInputs, payload, source);
  const trustedSource = payload ?? source;

  if (directLessonSlug && !isUnsafeLessonRouteValue(directLessonSlug)) {
    const matchingLesson = lessons.find((lesson) => lessonMatchesIdentifier(lesson, directLessonSlug));

    if (
      (!lessons.length && !matchingLesson) ||
      (matchingLesson && !isKnownLockedLesson(matchingLesson.id, [trustedSource], lessons))
    ) {
      const { lesson: resolvedLesson, resolvedRouteValue } = matchingLesson
        ? resolveLessonRouteTarget(matchingLesson, lessons, [directLessonSlug])
        : { lesson: null, resolvedRouteValue: directLessonSlug };
      const href = `${courseHref}/lessons/${resolvedRouteValue ?? directLessonSlug}`;

      logLessonRouteTarget({
        courseSlug: courseRouteId,
        lesson: resolvedLesson,
        resolvedRouteValue: resolvedRouteValue ?? directLessonSlug,
        source: "payload-slug",
        href,
      });

      return href;
    }
  }

  const sourceProgress = lessons.length ? buildCourseProgress(courseRouteId, lessons, trustedSource) : null;
  const orderedNextLessonId =
    sourceProgress && sourceProgress.completedCount < lessons.length
      ? lessons[sourceProgress.completedCount]?.id ?? null
      : null;
  const candidateLessonIds = [
    ...getPayloadLessonIds(payload),
    orderedNextLessonId,
    sourceProgress?.nextLessonId ?? null,
    getFirstExplicitUnlockedLessonId(trustedSource, lessons),
    fallbackLessonId,
    lessons[0]?.id ?? null,
  ];

  for (const candidateId of candidateLessonIds) {
    if (!candidateId) {
      continue;
    }

    const matchingLesson = lessons.find((lesson) => lessonMatchesIdentifier(lesson, candidateId));

    if (!matchingLesson) {
      continue;
    }

    const { lesson: resolvedLesson, resolvedRouteValue } = resolveLessonRouteTarget(
      matchingLesson,
      lessons,
      [candidateId],
    );

    if (!resolvedRouteValue || isKnownLockedLesson(matchingLesson.id, [trustedSource], lessons)) {
      continue;
    }

    const href = `${courseHref}/lessons/${resolvedRouteValue}`;

    logLessonRouteTarget({
      courseSlug: courseRouteId,
      lesson: resolvedLesson,
      resolvedRouteValue,
      source: "safe-enrollment",
      href,
    });

    return href;
  }

  logLessonRouteTarget({
    courseSlug: courseRouteId,
    lesson: null,
    resolvedRouteValue: null,
    source: "safe-enrollment-fallback",
    href: courseHref,
  });

  return null;
}

export function logMissingSafeLessonRoute({
  backendId,
  courseSlug,
  enrollmentStatus,
  lessonInputs = [],
  payload = null,
  source = null,
}: {
  backendId?: string | null;
  courseSlug: string;
  enrollmentStatus?: string | null;
  lessonInputs?: CourseProgressLessonInput[];
  payload?: unknown;
  source?: unknown;
}) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  const lessons = getSafeRoutingLessons(lessonInputs, payload, source);
  const progress = buildCourseProgress(courseSlug, lessons, payload ?? source);

  console.warn("No safe lesson route found after enrollment", {
    courseSlug,
    backendId: backendId ?? null,
    enrollmentStatus:
      enrollmentStatus ?? extractProgressMetadata(payload ?? source).enrollmentStatus ?? null,
    lessonsCount: lessons.length,
    lessons: lessons.map((lesson) => {
      const lessonState = progress.lessonStates.find((state) => state.lessonId === lesson.id);

      return {
        id: lesson.id,
        slug: lesson.slug ?? null,
        locked: lessonState?.isLocked ?? lesson.isLocked ?? null,
        completed: lessonState?.isCompleted ?? false,
      };
    }),
  });
}

export function clearLegacyCourseProgressStorage() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const keysToRemove: string[] = [];

    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);

      if (key && legacyProgressPrefixes.some((prefix) => key.startsWith(prefix))) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // Legacy demo cleanup should never block authenticated student views.
  }
}

export function useClearLegacyCourseProgress(enabled: boolean) {
  useEffect(() => {
    if (!enabled || legacyProgressStorageCleared) {
      return;
    }

    clearLegacyCourseProgressStorage();
    legacyProgressStorageCleared = true;
  }, [enabled]);
}

export function useCourseProgress(
  courseId: string,
  lessonInputs: CourseProgressLessonInput[],
  source?: unknown,
  apiCourseId?: string | null,
) {
  const [actionSource, setActionSource] = useState<{
    apiCourseId: string | null;
    baseSource: unknown;
    courseId: string;
    source: unknown;
  } | null>(null);
  const normalizedApiCourseId = apiCourseId?.trim() || null;
  const normalizedLessons = useMemo(() => normalizeLessonInputs(lessonInputs), [lessonInputs]);
  useStudentProgressVersion(true);
  const rememberedProgressSource = getRememberedStudentCourseSource(
    courseId,
    normalizedApiCourseId,
    source,
  );
  const scopedActionSource =
    actionSource?.courseId === courseId &&
    actionSource.apiCourseId === normalizedApiCourseId &&
    actionSource.baseSource === source
      ? actionSource.source
      : null;
  const backendProgressSource = useMemo(
    () =>
      rememberedProgressSource
        ? mergeStudentPayloadIntoSource(source, rememberedProgressSource)
        : source ?? null,
    [rememberedProgressSource, source],
  );
  const progressSource = useMemo(
    () =>
      scopedActionSource
        ? mergeStudentPayloadIntoSource(backendProgressSource, scopedActionSource)
        : backendProgressSource,
    [backendProgressSource, scopedActionSource],
  );
  const progress = useMemo(
    () => buildCourseProgress(courseId, normalizedLessons, progressSource),
    [courseId, normalizedLessons, progressSource],
  );
  const progressSnapshotRef = useRef<Record<string, LessonProgressValues>>(progress.lessonProgress);
  const lastProgressPayloadKeyByLessonRef = useRef<Record<string, string>>({});
  const completedLessonSet = useMemo(
    () => new Set(progress.completedLessonIds),
    [progress.completedLessonIds],
  );
  const lockedLessonSet = useMemo(
    () =>
      new Set(
        progress.lessonStates
          .filter((lessonState) => lessonState.isLocked)
          .map((lessonState) => lessonState.lessonId),
      ),
    [progress.lessonStates],
  );
  const getApiLessonId = useCallback(
    (lessonId: string) =>
      normalizedLessons.find((lesson) => lessonMatchesIdentifier(lesson, lessonId))?.backendId ??
      lessonId,
    [normalizedLessons],
  );

  useEffect(() => {
    progressSnapshotRef.current = progress.lessonProgress;
  }, [progress.lessonProgress]);

  const getMergedLessonProgress = useCallback(
    (lessonId: string, lessonProgressPatch: Partial<LessonProgressValues>) => {
      const baseProgress =
        progressSnapshotRef.current[lessonId] ??
        progress.lessonProgress[lessonId] ??
        normalizeProgressValues(null);
      const nextProgress = mergeLessonProgressValues(baseProgress, lessonProgressPatch);

      progressSnapshotRef.current = {
        ...progressSnapshotRef.current,
        [lessonId]: nextProgress,
      };

      return nextProgress;
    },
    [progress.lessonProgress],
  );

  const setMergedActionSource = useCallback(
    (
      payload: unknown,
      options: {
        notify?: boolean;
        reason?: string;
      } = {},
    ) => {
      const nextSource = mergeStudentPayloadIntoSource(progressSource ?? source, payload);

      setActionSource({
        apiCourseId: normalizedApiCourseId,
        baseSource: source,
        courseId,
        source: nextSource,
      });

      rememberStudentCourseSource(courseId, normalizedApiCourseId, nextSource, {
        notify: options.notify ?? true,
        reason: options.reason ?? "student-course-action",
      });

      return nextSource;
    },
    [courseId, normalizedApiCourseId, progressSource, source],
  );

  const enrollCourse = useCallback(async () => {
    if (!normalizedApiCourseId) {
      throw new Error("Missing backend course id for enrollment.");
    }

    try {
      const enrollmentPayload = await enrollStudentCourse(normalizedApiCourseId);

      try {
        const coursePayload = await fetchStudentCourse(normalizedApiCourseId);
        const routePayload = buildEnrollmentRoutePayload(enrollmentPayload, coursePayload);

        setMergedActionSource(routePayload, { reason: "student-enrollment" });
        return routePayload;
      } catch {
        setMergedActionSource(enrollmentPayload, { reason: "student-enrollment" });
        return enrollmentPayload;
      }
    } catch (error) {
      if (!isAlreadyEnrolledError(error)) {
        throw error;
      }

      const fallbackPayload = buildAlreadyEnrolledPayload(error);

      try {
        const coursePayload = await fetchStudentCourse(normalizedApiCourseId);
        const routePayload = buildEnrollmentRoutePayload(fallbackPayload, coursePayload);

        setMergedActionSource(routePayload, { reason: "student-enrollment" });
        return routePayload;
      } catch {
        setMergedActionSource(fallbackPayload, { reason: "student-enrollment" });
        return fallbackPayload;
      }
    }
  }, [normalizedApiCourseId, setMergedActionSource]);

  const updateLessonProgress = useCallback(
    (lessonId: string, lessonProgressPatch: Partial<LessonProgressValues>) => {
      if (!normalizedApiCourseId) {
        return;
      }

      const nextProgress = getMergedLessonProgress(lessonId, lessonProgressPatch);
      const lessonState = progress.lessonStates.find((state) => state.lessonId === lessonId);
      const normalizedLesson = normalizedLessons.find((lesson) => lessonMatchesIdentifier(lesson, lessonId));
      const requestPayload = buildLessonProgressPostPayload(
        nextProgress,
        false,
        lessonState?.type ?? normalizedLesson?.type ?? "TEXT",
      );

      if (!hasMeaningfulLessonProgressPayload(requestPayload)) {
        return;
      }

      const payloadKey = getLessonProgressPayloadKey(requestPayload);

      if (lastProgressPayloadKeyByLessonRef.current[lessonId] === payloadKey) {
        return;
      }

      lastProgressPayloadKeyByLessonRef.current[lessonId] = payloadKey;
      const progressErrorStateBefore = getProgressErrorStateSnapshot({
        enrollmentStatus: extractProgressMetadata(progressSource ?? source).enrollmentStatus,
        hasAccess: lessonState ? !lessonState.isLocked : false,
        lessonId,
        progress,
      });

      void updateStudentLessonProgress(normalizedApiCourseId, getApiLessonId(lessonId), requestPayload)
        .then((payload) => {
          setMergedActionSource(payload, { notify: false, reason: "student-lesson-progress" });
        })
        .catch(() => {
          console.log("[STATE_BEFORE_PROGRESS_ERROR]", progressErrorStateBefore);
          console.log("[STATE_AFTER_PROGRESS_ERROR]", getProgressErrorStateSnapshot({
            enrollmentStatus: extractProgressMetadata(progressSource ?? source).enrollmentStatus,
            hasAccess: lessonState ? !lessonState.isLocked : false,
            lessonId,
            progress,
          }));

          if (lastProgressPayloadKeyByLessonRef.current[lessonId] === payloadKey) {
            delete lastProgressPayloadKeyByLessonRef.current[lessonId];
          }

          // Partial progress is reloaded from the backend on the next successful fetch/action.
        });
    },
    [
      getApiLessonId,
      getMergedLessonProgress,
      normalizedApiCourseId,
      normalizedLessons,
      progress,
      progressSource,
      setMergedActionSource,
      source,
    ],
  );

  const markLessonComplete = useCallback(
    async (
      lessonId: string,
      verification: LessonCompletionVerification,
    ): Promise<MarkLessonCompleteResult> => {
      const lessonState = progress.lessonStates.find((state) => state.lessonId === lessonId);

      if (!lessonState || lessonState.isLocked) {
        return {
          completed: false,
          reason: "LOCKED",
          missingRequirements: [],
        };
      }

      if (lessonState.isCompleted) {
        return {
          completed: false,
          reason: "ALREADY_COMPLETED",
          missingRequirements: [],
        };
      }

      const missingRequirements = getMissingCompletionRequirements(verification);

      if (missingRequirements.length) {
        return {
          completed: false,
          reason: "REQUIREMENTS_UNMET",
          missingRequirements,
        };
      }

      if (!normalizedApiCourseId) {
        return {
          completed: false,
          reason: "BACKEND_REJECTED",
          missingRequirements: [],
          message: "Course progress is not available until this course syncs with the backend.",
        };
      }

      const progressErrorStateBefore = getProgressErrorStateSnapshot({
        enrollmentStatus: extractProgressMetadata(progressSource ?? source).enrollmentStatus,
        hasAccess: !lessonState.isLocked,
        lessonId,
        progress,
      });

      try {
        const completionProgress = getProgressFromVerification(verification);
        const requestPayload = buildLessonProgressPostPayload(
          completionProgress,
          true,
          verification.lessonType,
        );

        const payload = await updateStudentLessonProgress(
          normalizedApiCourseId,
          getApiLessonId(lessonId),
          requestPayload,
        );
        const confirmed = lessonCompletionConfirmed(payload, courseId, lessonId, normalizedLessons);

        if (!confirmed) {
          setMergedActionSource(payload, { reason: "student-lesson-progress-rejected" });

          return {
            completed: false,
            reason: "BACKEND_REJECTED",
            missingRequirements: [],
            message: "The backend accepted the request but did not confirm lesson completion.",
          };
        }

        const confirmedPayload = buildConfirmedLessonCompletionPayload(
          payload,
          lessonId,
          lessonState.type,
          completionProgress,
        );
        const nextSource = mergeStudentPayloadIntoSource(progressSource ?? source, confirmedPayload);

        setActionSource({
          apiCourseId: normalizedApiCourseId,
          baseSource: source,
          courseId,
          source: nextSource,
        });
        rememberStudentCourseSource(courseId, normalizedApiCourseId, nextSource, {
          notify: true,
          reason: "student-lesson-completion",
        });

        try {
          const refreshedPayload = await fetchStudentCourse(normalizedApiCourseId);
          const refreshedSource = mergeStudentPayloadIntoSource(nextSource, refreshedPayload);

          setActionSource({
            apiCourseId: normalizedApiCourseId,
            baseSource: source,
            courseId,
            source: refreshedSource,
          });
          rememberStudentCourseSource(courseId, normalizedApiCourseId, refreshedSource, {
            notify: true,
            reason: "student-lesson-completion-refresh",
            replace: true,
          });
        } catch {
          // The confirmed completion response is enough for the UI; course progress will refresh later.
        }

        return {
          completed: true,
          payload,
        };
      } catch (error) {
        console.log("[STATE_BEFORE_PROGRESS_ERROR]", progressErrorStateBefore);
        console.log("[STATE_AFTER_PROGRESS_ERROR]", getProgressErrorStateSnapshot({
          enrollmentStatus: extractProgressMetadata(progressSource ?? source).enrollmentStatus,
          hasAccess: !lessonState.isLocked,
          lessonId,
          progress,
        }));

        return {
          completed: false,
          reason: "BACKEND_REJECTED",
          missingRequirements: [],
          message: getProgressErrorMessage(error),
        };
      }
    },
    [
      courseId,
      getApiLessonId,
      normalizedApiCourseId,
      normalizedLessons,
      progress,
      progressSource,
      setMergedActionSource,
      source,
    ],
  );

  return {
    completedLessonSet,
    enrollCourse,
    lessonProgressById: progress.lessonProgress,
    lockedLessonSet,
    markLessonComplete,
    progress,
    updateLessonProgress,
  };
}

function normalizeMatchKey(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/\s+/g, " ") ?? null;
}

function getRecordTitle(value: unknown) {
  const record = combineNestedCourseRecord(value);
  return record ? readString(record, ["title", "name"]) : null;
}

function findPublicCourseForStudentRecord(
  value: unknown,
  publicCourseById: Map<string, CourseSummary>,
  publicCourseByTitle: Map<string, CourseSummary>,
) {
  const record = isRecord(value) ? value : null;

  if (record) {
    const slug = normalizeCourseRouteId(getCourseSlugFromRecord(record));
    const nestedCourseId = readCourseContainerString(record, ["id", "_id", "slug", "courseSlug"]);
    const topLevelId = readString(record, ["id", "_id", "courseId", "courseID"]);

    for (const candidateId of [slug, nestedCourseId, topLevelId]) {
      const normalizedCandidateId = normalizeCourseRouteId(candidateId);

      if (normalizedCandidateId && publicCourseById.has(normalizedCandidateId)) {
        return publicCourseById.get(normalizedCandidateId) ?? null;
      }
    }
  }

  const titleKey = normalizeMatchKey(getRecordTitle(value));
  return titleKey ? publicCourseByTitle.get(titleKey) ?? null : null;
}

export function mergeStudentCourseSummaries(
  publicCourses: CourseSummary[],
  payload: unknown,
) {
  const backendCourses = extractCourseArray(payload);
  const publicCourseById = new Map<string, CourseSummary>();
  const publicCourseByTitle = new Map<string, CourseSummary>();

  publicCourses.forEach((course) => {
    publicCourseById.set(course.id, course);
    publicCourseById.set(getCourseRouteId(course), course);

    if (course.slug) {
      publicCourseById.set(normalizeCourseRouteId(course.slug) ?? course.slug, course);
    }

    const titleKey = normalizeMatchKey(course.title);

    if (titleKey) {
      publicCourseByTitle.set(titleKey, course);
    }
  });

  const mergedCourses = backendCourses
    .map((item) => {
      const publicCourse = findPublicCourseForStudentRecord(
        item,
        publicCourseById,
        publicCourseByTitle,
      );
      return normalizeCourseSummary(item, publicCourse);
    })
    .filter((course): course is CourseSummary => Boolean(course));
  const mergedCourseByRouteId = new Map<string, CourseSummary>();

  mergedCourses.forEach((course) => {
    const routeId = getCourseRouteId(course);
    const existingCourse = mergedCourseByRouteId.get(routeId);

    if (!existingCourse || (!existingCourse.backendId && course.backendId)) {
      mergedCourseByRouteId.set(routeId, course);
    }
  });

  return Array.from(mergedCourseByRouteId.values());
}

export function useStudentCourses(enabled: boolean, publicCourses: CourseSummary[]) {
  const [reloadKey, setReloadKey] = useState(0);
  const progressVersion = useStudentProgressVersion(enabled);
  const [state, setState] = useState<AsyncState<CourseSummary[]>>({
    data: [],
    isLoading: true,
    errorMessage: null,
  });

  useClearLegacyCourseProgress(enabled);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let isMounted = true;

    fetchStudentCourses()
      .then((payload) => {
        if (!isMounted) {
          return;
        }

        const normalizedCourses = mergeStudentCourseSummaries(publicCourses, payload);

        rememberStudentCourseSummaries(normalizedCourses);

        setState({
          data: normalizedCourses,
          isLoading: false,
          errorMessage: null,
        });
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }

        logCourseBackendFallback("/courses", "student_courses_fetch_failed");

        setState({
          data: publicCourses,
          isLoading: false,
          errorMessage: getErrorMessage(error, "Unable to load student courses."),
        });
      });

    return () => {
      isMounted = false;
    };
  }, [enabled, progressVersion, publicCourses, reloadKey]);

  const syncedCourses = state.data.map(applyRememberedStudentCourseSummary);

  return {
    courses: enabled ? syncedCourses : publicCourses,
    isLoading: enabled ? state.isLoading : false,
    errorMessage: enabled ? state.errorMessage : null,
    reload: () => setReloadKey((currentKey) => currentKey + 1),
  };
}

async function fetchNormalizedStudentCourse(fallbackCourse: Course) {
  const apiCourseId = getCourseRouteId(fallbackCourse);
  const payload = await fetchStudentCourse(apiCourseId);

  return normalizeCourseDetail(payload, fallbackCourse);
}

function buildLessonAccessState(
  course: Course,
  lessonId: string,
  overrides: Partial<StudentLessonAccessState>,
): StudentLessonAccessState {
  const lesson = getLessonByIdentifier(course, lessonId);

  return {
    canAccess: false,
    status: null,
    backendLocked: null,
    enrollmentStatus: course.enrollmentStatus ?? null,
    hasContent: lessonHasDisplayContent(lesson),
    reason: "loading",
    ...overrides,
  };
}

async function loadStudentCourseShell(fallbackCourse: Course) {
  const apiCourseId = getCourseRouteId(fallbackCourse);

  try {
    const coursePayload = await fetchStudentCourse(apiCourseId);
    return normalizeCourseDetail(coursePayload, fallbackCourse);
  } catch {
    logCourseBackendFallback(`/courses/${apiCourseId}`, "student_course_shell_fetch_failed");
    return fallbackCourse;
  }
}

async function fetchNormalizedStudentLesson(
  fallbackCourse: Course,
  lessonId: string,
): Promise<StudentLessonLoadResult> {
  const apiCourseId = getCourseRouteId(fallbackCourse);

  try {
    const lessonPayload = await fetchStudentLesson(apiCourseId, lessonId);
    const deniedReason = getLessonAccessDeniedReason(lessonPayload);
    const courseWithProgress = await loadStudentCourseShell(fallbackCourse);
    const backendLocked = getExplicitLessonLocked(lessonPayload);

    if (deniedReason) {
      return {
        course: courseWithProgress,
        errorMessage:
          deniedReason === "requiresEnrollment"
            ? "Enrollment is required before this lesson can be opened."
            : "The backend denied access to this lesson.",
        access: buildLessonAccessState(courseWithProgress, lessonId, {
          backendLocked,
          reason: deniedReason,
          status: 200,
        }),
      };
    }

    const courseWithLesson = forceLessonAccessAllowed(
      mergeLessonIntoCourse(courseWithProgress, lessonPayload, lessonId),
      lessonId,
    );

    return {
      course: courseWithLesson,
      errorMessage: null,
      access: buildLessonAccessState(courseWithLesson, lessonId, {
        backendLocked,
        canAccess: true,
        reason: "lesson_200",
        status: 200,
      }),
    };
  } catch (lessonError) {
    logCourseBackendFallback(
      `/courses/${apiCourseId}/lessons/${lessonId}`,
      "student_lesson_fetch_failed",
    );
    const courseWithProgress = await loadStudentCourseShell(fallbackCourse);
    const status = lessonError instanceof StudentApiError ? lessonError.status : 0;
    const deniedReason =
      lessonError instanceof StudentApiError
        ? getLessonAccessDeniedReason(lessonError.data)
        : null;
    const reason =
      deniedReason ?? (status === 401 || status === 403 ? `http_${status}` : "lesson_request_failed");

    return {
      course: courseWithProgress,
      errorMessage: getErrorMessage(lessonError, "Unable to load this lesson from the backend."),
      access: buildLessonAccessState(courseWithProgress, lessonId, {
        backendLocked: lessonError instanceof StudentApiError ? getExplicitLessonLocked(lessonError.data) : null,
        reason,
        status,
      }),
    };
  }
}

export function useStudentCourse(
  courseId: string,
  fallbackCourse: Course,
  enabled: boolean,
) {
  const mountedRef = useRef(false);
  const [reloadKey, setReloadKey] = useState(0);
  const progressVersion = useStudentProgressVersion(enabled);
  const [state, setState] = useState<AsyncState<Course>>({
    data: fallbackCourse,
    isLoading: true,
    errorMessage: null,
  });

  useClearLegacyCourseProgress(enabled);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled) {
      return fallbackCourse;
    }

    if (mountedRef.current) {
      setState((currentState) => ({
        ...currentState,
        isLoading: true,
        errorMessage: null,
      }));
    }

    try {
      const refreshedCourse = await fetchNormalizedStudentCourse(fallbackCourse);

      rememberStudentCourseDetailSource(refreshedCourse);

      if (mountedRef.current) {
        setState({
          data: refreshedCourse,
          isLoading: false,
          errorMessage: null,
        });
      }

      return refreshedCourse;
    } catch (error) {
      logCourseBackendFallback(`/courses/${getCourseRouteId(fallbackCourse)}`, "student_course_fetch_failed");

      if (mountedRef.current) {
        setState((currentState) => ({
          data: currentState.data,
          isLoading: false,
          errorMessage: getErrorMessage(error, "Unable to load student course progress."),
        }));
      }

      throw error;
    }
  }, [enabled, fallbackCourse]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let isMounted = true;

    fetchNormalizedStudentCourse(fallbackCourse)
      .then((refreshedCourse) => {
        if (!isMounted) {
          return;
        }

        rememberStudentCourseDetailSource(refreshedCourse);

        setState({
          data: refreshedCourse,
          isLoading: false,
          errorMessage: null,
        });
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }

        logCourseBackendFallback(`/courses/${getCourseRouteId(fallbackCourse)}`, "student_course_fetch_failed");

        setState((currentState) => ({
          data: currentState.data,
          isLoading: false,
          errorMessage: getErrorMessage(error, "Unable to load student course progress."),
        }));
      });

    return () => {
      isMounted = false;
    };
  }, [courseId, enabled, fallbackCourse, progressVersion, reloadKey]);

  const syncedCourse = applyRememberedStudentCourseDetail(state.data);

  return {
    course: enabled ? syncedCourse : fallbackCourse,
    isLoading: enabled ? state.isLoading : false,
    errorMessage: enabled ? state.errorMessage : null,
    reload: () => setReloadKey((currentKey) => currentKey + 1),
    refresh,
  };
}

export function useStudentLesson(
  courseId: string,
  lessonId: string,
  fallbackCourse: Course,
  enabled: boolean,
) {
  const mountedRef = useRef(false);
  const [reloadKey, setReloadKey] = useState(0);
  const progressVersion = useStudentProgressVersion(enabled);
  const [state, setState] = useState<StudentLessonAsyncState>({
    data: fallbackCourse,
    access: buildLessonAccessState(fallbackCourse, lessonId, {
      reason: "loading",
    }),
    isLoading: true,
    errorMessage: null,
  });
  const stateRef = useRef(state);

  useClearLegacyCourseProgress(enabled);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled) {
      return {
        course: fallbackCourse,
        errorMessage: null,
        access: buildLessonAccessState(fallbackCourse, lessonId, {
          reason: "disabled",
        }),
      };
    }

    if (mountedRef.current) {
      setState((currentState) => ({
        ...currentState,
        access: {
          ...currentState.access,
          reason: "loading",
        },
        isLoading: true,
        errorMessage: null,
      }));
    }

    try {
      const result = await fetchNormalizedStudentLesson(fallbackCourse, lessonId);

      rememberStudentCourseDetailSource(result.course, true);

      if (mountedRef.current) {
        setState({
          data: result.course,
          access: result.access,
          isLoading: false,
          errorMessage: result.errorMessage,
        });
      }

      return result;
    } catch (error) {
      logCourseBackendFallback(
        `/courses/${getCourseRouteId(fallbackCourse)}/lessons/${lessonId}`,
        "student_lesson_fetch_failed",
      );
      const currentState = stateRef.current;
      const course = currentState.data;
      const access = currentState.access.canAccess
        ? currentState.access
        : buildLessonAccessState(course, lessonId, {
            reason: "lesson_request_failed",
            status: error instanceof StudentApiError ? error.status : 0,
          });
      const errorMessage = getErrorMessage(error, "Unable to load this lesson from the backend.");

      if (mountedRef.current) {
        setState((currentState) => ({
          data: currentState.data,
          access: currentState.access.canAccess
            ? currentState.access
            : buildLessonAccessState(currentState.data, lessonId, {
                reason: "lesson_request_failed",
                status: error instanceof StudentApiError ? error.status : 0,
              }),
          isLoading: false,
          errorMessage,
        }));
      }

      return {
        course,
        errorMessage,
        access,
      };
    }
  }, [enabled, fallbackCourse, lessonId]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let isMounted = true;

    fetchNormalizedStudentLesson(fallbackCourse, lessonId)
      .then((result) => {
        if (!isMounted) {
          return;
        }

        rememberStudentCourseDetailSource(result.course);

        setState({
          data: result.course,
          access: result.access,
          isLoading: false,
          errorMessage: result.errorMessage,
        });
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }

        logCourseBackendFallback(
          `/courses/${getCourseRouteId(fallbackCourse)}/lessons/${lessonId}`,
          "student_lesson_fetch_failed",
        );
        const errorMessage = getErrorMessage(error, "Unable to load this lesson from the backend.");

        setState((currentState) => ({
          data: currentState.data,
          access: currentState.access.canAccess
            ? currentState.access
            : buildLessonAccessState(currentState.data, lessonId, {
                reason: "lesson_request_failed",
                status: error instanceof StudentApiError ? error.status : 0,
              }),
          isLoading: false,
          errorMessage,
        }));
      });

    return () => {
      isMounted = false;
    };
  }, [courseId, enabled, fallbackCourse, lessonId, progressVersion, reloadKey]);

  const syncedCourse = applyRememberedStudentCourseDetail(state.data);

  return {
    course: enabled ? syncedCourse : fallbackCourse,
    isLoading: enabled ? state.isLoading : false,
    errorMessage: enabled ? state.errorMessage : null,
    lessonAccess: enabled
      ? state.access
      : buildLessonAccessState(fallbackCourse, lessonId, {
          reason: "disabled",
        }),
    reload: () => setReloadKey((currentKey) => currentKey + 1),
    refresh,
  };
}

export function normalizeContinueLearningItems(
  payload: unknown,
  courses: CourseSummary[],
): ContinueLearningItem[] {
  const courseById = new Map<string, CourseSummary>();
  const courseByTitle = new Map<string, CourseSummary>();

  courses.forEach((course) => {
    courseById.set(course.id, course);
    courseById.set(getCourseRouteId(course), course);

    if (course.slug) {
      courseById.set(normalizeCourseRouteId(course.slug) ?? course.slug, course);
    }

    const titleKey = normalizeMatchKey(course.title);

    if (titleKey) {
      courseByTitle.set(titleKey, course);
    }
  });

  const continueLearningRecords = extractItemArray(payload);
  const normalizedRecords =
    continueLearningRecords.length || !isRecord(payload)
      ? continueLearningRecords
      : readBoolean(payload, ["hasEnrollment"]) === false && !readString(payload, ["courseId", "courseSlug"])
        ? []
        : [payload];

  return normalizedRecords
    .map<ContinueLearningItem | null>((item) => {
      const record = combineNestedCourseRecord(item);
      const course = normalizeCourseSummary(
        item,
        findPublicCourseForStudentRecord(item, courseById, courseByTitle),
      );

      if (!course) {
        return null;
      }

      return {
        ...course,
        currentLessonTitle:
          (record && readString(record, ["currentLessonTitle", "lessonTitle"])) ??
          (record && readNestedString(record, ["lesson", "currentLesson", "nextLesson"], ["title", "name"])) ??
          null,
        currentLessonSummary:
          (record && readString(record, ["currentLessonSummary", "lessonSummary"])) ??
          (record &&
            readNestedString(record, ["lesson", "currentLesson", "nextLesson"], ["summary", "description"])) ??
          null,
        href: (record && readString(record, ["href", "url"])) ?? null,
      };
    })
    .filter((item): item is ContinueLearningItem => item !== null)
    .filter((item) => buildCourseProgress(item.id, item.lessonIds, item).isEnrolled);
}

function applyRememberedContinueLearningItem(item: ContinueLearningItem) {
  const syncedCourse = applyRememberedStudentCourseSummary(item);

  return {
    ...item,
    ...syncedCourse,
    currentLessonTitle: item.currentLessonTitle ?? null,
    currentLessonSummary: item.currentLessonSummary ?? null,
    href: item.href ?? null,
  };
}

function deriveContinueLearningItemsFromCourses(courses: CourseSummary[]): ContinueLearningItem[] {
  return courses
    .map(applyRememberedStudentCourseSummary)
    .filter((course) => buildCourseProgress(course.id, course.lessonIds, course).isEnrolled)
    .sort((firstCourse, secondCourse) => {
      const firstTimestamp = firstCourse.lastAccessedAt ? new Date(firstCourse.lastAccessedAt).getTime() : 0;
      const secondTimestamp = secondCourse.lastAccessedAt ? new Date(secondCourse.lastAccessedAt).getTime() : 0;
      const firstTime = Number.isFinite(firstTimestamp) ? firstTimestamp : 0;
      const secondTime = Number.isFinite(secondTimestamp) ? secondTimestamp : 0;

      return secondTime - firstTime;
    })
    .map((course) => ({
      ...course,
      currentLessonTitle: null,
      currentLessonSummary: null,
      href: null,
    }));
}

export function useStudentContinueLearning(enabled: boolean, courses: CourseSummary[]) {
  const [reloadKey, setReloadKey] = useState(0);
  const progressVersion = useStudentProgressVersion(enabled);
  const coursesRef = useRef(courses);
  const [state, setState] = useState<AsyncState<ContinueLearningItem[]>>({
    data: [],
    isLoading: false,
    errorMessage: null,
  });

  useEffect(() => {
    coursesRef.current = courses;
  }, [courses]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let isMounted = true;

    fetchStudentContinueLearning()
      .then((payload) => {
        if (!isMounted) {
          return;
        }

        const normalizedItems = normalizeContinueLearningItems(payload, coursesRef.current);

        rememberStudentCourseSummaries(normalizedItems, false);

        setState({
          data: normalizedItems,
          isLoading: false,
          errorMessage: null,
        });
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }

        setState((currentState) => ({
          data: currentState.data,
          isLoading: false,
          errorMessage: getErrorMessage(error, "Unable to load continue learning."),
        }));
      });

    return () => {
      isMounted = false;
    };
  }, [enabled, progressVersion, reloadKey]);

  const syncedItems = state.data
    .map(applyRememberedContinueLearningItem)
    .filter((item) => buildCourseProgress(item.id, item.lessonIds, item).isEnrolled);
  const courseDerivedItems = deriveContinueLearningItemsFromCourses(courses);

  return {
    items: enabled ? (syncedItems.length ? syncedItems : courseDerivedItems) : [],
    isLoading: enabled ? state.isLoading : false,
    errorMessage: enabled ? state.errorMessage : null,
    reload: () => setReloadKey((currentKey) => currentKey + 1),
  };
}

function normalizeActivityTone(type: string | null) {
  const normalizedType = type?.toLowerCase() ?? "";

  if (normalizedType.includes("complete") || normalizedType.includes("lesson")) {
    return "cyan" as const;
  }

  if (normalizedType.includes("tutor") || normalizedType.includes("hint")) {
    return "purple" as const;
  }

  if (normalizedType.includes("challenge")) {
    return "pink" as const;
  }

  return "neutral" as const;
}

function normalizeActivityType(type: string | null) {
  return type?.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_") ?? "";
}

function isPhishingActivity(value: Record<string, unknown>) {
  const challengeTitle =
    readString(value, ["challengeTitle"]) ??
    readNestedString(value, ["challenge"], ["title", "name"]) ??
    "";
  const challengeSlug =
    readString(value, ["challengeSlug", "slug"]) ??
    readNestedString(value, ["challenge"], ["slug"]) ??
    "";
  const searchable = `${challengeTitle} ${challengeSlug}`.toLowerCase();

  return searchable.includes("phishing");
}

function buildActivityLabel(type: string | null) {
  const normalizedType = normalizeActivityType(type);

  switch (normalizedType) {
    case "LOGIN_SUCCESS":
      return "Logged in";
    case "LESSON_COMPLETED":
      return "Completed lesson";
    case "LESSON_VIEWED":
      return "Viewed lesson";
    case "QUIZ_COMPLETED":
    case "QUIZ_ATTEMPT":
    case "QUIZ_SUBMITTED":
    case "QUIZ_PASSED":
      return "Completed quiz";
    case "CHALLENGE_ATTEMPT":
      return "Attempted challenge";
    case "CHALLENGE_SOLVED":
      return "Solved challenge";
    case "AI_TUTOR_USED":
      return "Used AI Tutor";
    case "CHALLENGE_HINT_USED":
    case "HINT_USED":
      return "Used hint";
    case "COURSE_ENROLLED":
      return "Enrolled in course";
    default:
      return null;
  }
}

function buildActivityDescription(
  value: Record<string, unknown>,
  type: string | null,
  lessonTitle: string | null,
  courseTitle: string | null,
) {
  const normalizedType = normalizeActivityType(type);

  switch (normalizedType) {
    case "LOGIN_SUCCESS":
      return "Student session authenticated successfully.";
    case "LESSON_COMPLETED":
      return lessonTitle
        ? `Completed ${lessonTitle}.`
        : "A backend-tracked lesson completion was recorded.";
    case "QUIZ_COMPLETED":
    case "QUIZ_SUBMITTED":
    case "QUIZ_PASSED":
      return "A backend quiz attempt was completed.";
    case "CHALLENGE_ATTEMPT":
      return isPhishingActivity(value)
        ? "A phishing-awareness challenge submission was recorded."
        : "A challenge submission was recorded.";
    case "CHALLENGE_SOLVED":
      return isPhishingActivity(value)
        ? "Suspicious phishing indicators were recognized and the defensive challenge was solved."
        : "A backend challenge solve was recorded.";
    case "AI_TUTOR_USED":
      return "Safe AI Tutor guidance was requested during learning.";
    case "COURSE_ENROLLED":
      return courseTitle
        ? `Enrollment started for ${courseTitle}.`
        : "A student course enrollment was recorded by the backend.";
    default:
      return null;
  }
}

function normalizeActivityItem(value: unknown, index: number): StudentActivityItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const type = readString(value, ["type", "eventType", "kind", "activityType", "actionType"]);
  const lessonTitle = readString(value, ["lessonTitle"]) ?? readNestedString(value, ["lesson"], ["title", "name"]);
  const courseTitle = readString(value, ["courseTitle"]) ?? readNestedString(value, ["course"], ["title", "name"]);
  const fallbackDescription = [courseTitle, lessonTitle].filter(Boolean).join(" / ");
  const knownLabel = buildActivityLabel(type);
  const backendLabel = readString(value, ["label", "title", "message"]);
  const label =
    knownLabel ??
    backendLabel ??
    (lessonTitle ? `Completed ${lessonTitle}` : courseTitle ? `Course activity in ${courseTitle}` : "Learning activity");
  const backendDescription =
    readString(value, ["description", "details"]) ??
    buildActivityDescription(value, type, lessonTitle, courseTitle);
  const description =
    backendDescription ?? (fallbackDescription || "Student learning activity recorded by the backend.");
  const createdAt = readString(value, ["createdAt", "updatedAt", "time", "timestamp"]);
  const referenceId =
    readString(value, ["referenceId", "entityId", "lessonId"]) ??
    readNestedString(value, ["lesson"], ["id"]);

  return {
    id: readString(value, ["id"]) ?? `${createdAt ?? "activity"}-${index}`,
    label,
    description,
    createdAt,
    tone: normalizeActivityTone(type),
    type,
    dedupeKey: referenceId ? `${normalizeActivityType(type)}:${referenceId}` : undefined,
  };
}

function deduplicateActivityItems(items: StudentActivityItem[]) {
  const seen = new Set<string>();
  const deduplicated: StudentActivityItem[] = [];

  for (const item of items) {
    const normalizedType = normalizeActivityType(item.type);
    const key =
      normalizedType === "LESSON_COMPLETED"
        ? item.dedupeKey ?? `${normalizedType}:${item.label}:${item.description}`
        : item.id;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduplicated.push(item);
  }

  return deduplicated;
}

function normalizeAchievementTone(type: string | null, label: string, isEarned: boolean) {
  const searchable = `${type ?? ""} ${label}`.toLowerCase();

  if (!isEarned) {
    return "neutral" as const;
  }

  if (searchable.includes("challenge") || searchable.includes("streak")) {
    return "pink" as const;
  }

  if (searchable.includes("course") || searchable.includes("badge") || searchable.includes("path")) {
    return "purple" as const;
  }

  if (searchable.includes("lesson") || searchable.includes("complete") || searchable.includes("progress")) {
    return "cyan" as const;
  }

  return "cyan" as const;
}

function normalizeAchievementItem(
  value: unknown,
  index: number,
  defaultEarned: boolean,
): StudentAchievementItem | null {
  if (typeof value === "string") {
    const label = value.trim();

    if (!label) {
      return null;
    }

    return {
      id: `achievement-${index}-${label.toLowerCase().replace(/\s+/g, "-")}`,
      label,
      description: null,
      earnedAt: null,
      isEarned: defaultEarned,
      progressPercent: null,
      tone: normalizeAchievementTone(null, label, defaultEarned),
      type: null,
    };
  }

  if (!isRecord(value)) {
    return null;
  }

  const label = readString(value, ["label", "title", "name", "badgeName"]) ?? `Badge ${index + 1}`;
  const type = readString(value, ["type", "kind", "badgeType"]);
  const locked = readBoolean(value, ["isLocked", "locked"]);
  const explicitEarned =
    readBoolean(value, ["isEarned", "earned", "unlocked", "isUnlocked"]) ??
    (locked === true ? false : null);
  const isEarned = explicitEarned ?? defaultEarned;
  const progressPercent = readNumber(value, ["progressPercent", "progress", "percent", "completionPercent"]);

  return {
    id: readString(value, ["id", "_id", "key", "slug"]) ?? `achievement-${index}-${label}`,
    label,
    description: readString(value, ["description", "summary", "requirement"]),
    earnedAt: readString(value, ["earnedAt", "unlockedAt", "createdAt"]),
    isEarned,
    progressPercent: progressPercent === null ? null : clampPercentage(progressPercent),
    tone: normalizeAchievementTone(type, label, isEarned),
    type,
  };
}

function getDashboardRecord(payload: unknown) {
  if (!isRecord(payload)) {
    return null;
  }

  const nestedRecord = readNestedRecord(payload, [
    "dashboard",
    "studentDashboard",
    "summary",
    "overview",
    "data",
  ]);

  return nestedRecord ? { ...payload, ...nestedRecord } : payload;
}

function extractDashboardCourseItems(record: Record<string, unknown> | null) {
  if (!record) {
    return [];
  }

  const enrolledCoursesRecord = readNestedRecord(record, ["enrolledCourses"]);

  return (
    readArray(record, ["enrolledCourses", "courses", "studentCourses"]) ??
    readArray(enrolledCoursesRecord ?? {}, ["courses", "items", "data", "results"]) ??
    readNestedArray(record, ["dashboard", "studentDashboard", "data"], [
      "enrolledCourses",
      "courses",
      "studentCourses",
    ]) ??
    []
  );
}

function normalizeDashboardActivity(record: Record<string, unknown> | null) {
  if (!record) {
    return [];
  }

  const activityItems =
    readArray(record, ["activity", "activities", "events", "learningUpdates", "activityFeed"]) ??
    readArray(readNestedRecord(record, ["recentActivity"]) ?? {}, [
      "activities",
      "items",
      "data",
      "results",
    ]) ??
    readNestedArray(record, ["dashboard", "studentDashboard", "data"], [
      "activity",
      "activities",
      "events",
      "learningUpdates",
      "activityFeed",
    ]) ??
    [];

  return deduplicateActivityItems(
    activityItems
      .map(normalizeActivityItem)
      .filter((item): item is StudentActivityItem => Boolean(item)),
  );
}

function normalizeDashboardActiveChallenge(record: Record<string, unknown> | null): StudentActiveChallengeItem | null {
  if (!record) {
    return null;
  }

  const dashboardDataRecord = readNestedRecord(record, ["dashboard", "studentDashboard", "data"]);
  const challengeRecord =
    readNestedRecord(record, ["activeChallenge", "challenge"]) ??
    readNestedRecord(dashboardDataRecord ?? {}, ["activeChallenge", "challenge"]);

  if (!challengeRecord) {
    return null;
  }

  const title = readString(challengeRecord, ["title", "name"]) ?? "Phishing Awareness Challenge";
  const solvedAt = readString(challengeRecord, ["solvedAt", "completedAt"]);
  const status =
    readString(challengeRecord, ["status", "studentStatus", "state"]) ??
    (solvedAt ? "solved" : "available");

  return {
    id: readString(challengeRecord, ["id", "challengeId"]),
    slug: readString(challengeRecord, ["slug", "challengeSlug"]),
    title,
    category: readString(challengeRecord, ["category"]),
    difficulty: readString(challengeRecord, ["difficulty"]),
    status,
    solvedAt,
    href: readString(challengeRecord, ["href", "url"]) ?? "/challenges",
  };
}

function normalizePhishingDefenderBadge(record: Record<string, unknown>) {
  const activeChallenge = normalizeDashboardActiveChallenge(record);
  const searchable = `${activeChallenge?.title ?? ""} ${activeChallenge?.slug ?? ""}`.toLowerCase();

  if (!activeChallenge || !searchable.includes("phishing")) {
    return null;
  }

  const normalizedStatus = activeChallenge.status.toLowerCase();
  const isEarned = normalizedStatus.includes("solved") || Boolean(activeChallenge.solvedAt);

  return {
    id: "phishing-defender",
    label: "Phishing Defender",
    description:
      "Recognized suspicious phishing indicators and completed the defensive challenge.",
    earnedAt: activeChallenge.solvedAt,
    isEarned,
    progressPercent: isEarned ? 100 : 0,
    tone: normalizeAchievementTone("challenge", "Phishing Defender", isEarned),
    type: "challenge",
  } satisfies StudentAchievementItem;
}

function normalizeDashboardAchievements(record: Record<string, unknown> | null) {
  if (!record) {
    return [];
  }

  const earnedItems =
    readArray(record, ["achievements", "earnedAchievements", "badges", "earnedBadges"]) ?? [];
  const lockedItems =
    readArray(record, ["lockedAchievements", "nextAchievements", "upcomingAchievements"]) ?? [];
  const achievementById = new Map<string, StudentAchievementItem>();
  const phishingDefenderBadge = normalizePhishingDefenderBadge(record);

  [
    ...earnedItems.map((item, index) => normalizeAchievementItem(item, index, true)),
    ...lockedItems.map((item, index) => normalizeAchievementItem(item, earnedItems.length + index, false)),
    phishingDefenderBadge,
  ]
    .filter((item): item is StudentAchievementItem => Boolean(item))
    .forEach((item) => {
      achievementById.set(item.id, item);
    });

  return Array.from(achievementById.values());
}

function normalizeDashboardNextBadge(record: Record<string, unknown> | null) {
  if (!record) {
    return null;
  }

  const nextBadgeValue =
    readValue(record, ["nextBadge", "nextAchievement", "upcomingBadge"]) ??
    readValue(readNestedRecord(record, ["dashboard", "studentDashboard", "data"]) ?? {}, [
      "nextBadge",
      "nextAchievement",
      "upcomingBadge",
    ]);

  const nextBadge = normalizeAchievementItem(nextBadgeValue, 0, false);

  if (nextBadge?.id === "phishing-defender" || nextBadge?.label === "Phishing Defender") {
    const activeChallenge = normalizeDashboardActiveChallenge(record);
    const normalizedStatus = activeChallenge?.status.toLowerCase() ?? "";

    if (normalizedStatus.includes("solved") || activeChallenge?.solvedAt) {
      return null;
    }
  }

  return nextBadge;
}

export function normalizeStudentDashboardSummary(
  payload: unknown,
  publicCourses: CourseSummary[],
): StudentDashboardSummary {
  const record = getDashboardRecord(payload);
  const enrolledCoursePayload = extractDashboardCourseItems(record);
  const enrolledCourseItems = enrolledCoursePayload.length
    ? mergeStudentCourseSummaries(publicCourses, { courses: enrolledCoursePayload })
    : [];
  const completedLessons =
    record
      ? readCount(record, ["completedLessons", "completedLessonCount", "completedLessonsCount"]) ??
        readNestedCount(record, ["stats", "metrics", "progress"], [
          "completedLessons",
          "completedLessonCount",
          "completedLessonsCount",
        ])
      : null;
  const totalLessons =
    record
      ? readCount(record, ["totalLessons", "lessonCount", "lessonsCount"]) ??
        readNestedCount(record, ["stats", "metrics", "progress"], [
          "totalLessons",
          "lessonCount",
          "lessonsCount",
        ])
      : null;
  const averageProgress =
    record
      ? readNumber(record, [
          "averageProgress",
          "averageProgressPercent",
          "avgProgress",
          "progressAverage",
          "overallProgress",
        ]) ??
        readNestedNumber(record, ["stats", "metrics", "progress"], [
          "averageProgress",
          "averageProgressPercent",
          "avgProgress",
          "progressAverage",
          "overallProgress",
        ])
      : null;
  const enrolledCourses =
    record
      ? readCount(record, ["enrolledCourses", "enrolledCourseCount", "enrolledCoursesCount"]) ??
        readNestedCount(record, ["stats", "metrics", "progress"], [
          "enrolledCourses",
          "enrolledCourseCount",
          "enrolledCoursesCount",
        ]) ??
        (enrolledCourseItems.length ? enrolledCourseItems.length : null)
      : null;

  if (enrolledCourseItems.length) {
    rememberStudentCourseSummaries(enrolledCourseItems, false);
  }

  const activeChallenge = normalizeDashboardActiveChallenge(record);

  return {
    completedLessons,
    totalLessons,
    averageProgress: averageProgress === null ? null : clampPercentage(averageProgress),
    enrolledCourses,
    enrolledCourseItems,
    activity: normalizeDashboardActivity(record),
    achievements: normalizeDashboardAchievements(record),
    nextBadge: normalizeDashboardNextBadge(record),
    activeChallenge,
  };
}

export function useStudentDashboard(enabled: boolean, publicCourses: CourseSummary[]) {
  const [reloadKey, setReloadKey] = useState(0);
  const progressVersion = useStudentProgressVersion(enabled);
  const [state, setState] = useState<AsyncState<StudentDashboardSummary | null>>({
    data: null,
    isLoading: true,
    errorMessage: null,
  });

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let isMounted = true;

    fetchStudentDashboard()
      .then((payload) => {
        if (!isMounted) {
          return;
        }

        setState({
          data: normalizeStudentDashboardSummary(payload, publicCourses),
          isLoading: false,
          errorMessage: null,
        });
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }

        setState((currentState) => ({
          data: currentState.data,
          isLoading: false,
          errorMessage: getErrorMessage(error, "Unable to load student dashboard."),
        }));
      });

    return () => {
      isMounted = false;
    };
  }, [enabled, progressVersion, publicCourses, reloadKey]);

  return {
    dashboard: enabled ? state.data : null,
    isLoading: enabled ? state.isLoading : false,
    errorMessage: enabled ? state.errorMessage : null,
    reload: () => setReloadKey((currentKey) => currentKey + 1),
  };
}

export function useStudentActivity(enabled: boolean) {
  const [reloadKey, setReloadKey] = useState(0);
  const progressVersion = useStudentProgressVersion(enabled);
  const [state, setState] = useState<AsyncState<StudentActivityItem[]>>({
    data: [],
    isLoading: false,
    errorMessage: null,
  });

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let isMounted = true;

    fetchStudentActivity()
      .then((payload) => {
        if (!isMounted) {
          return;
        }

        setState({
          data: deduplicateActivityItems(
            extractItemArray(payload)
              .map(normalizeActivityItem)
              .filter((item): item is StudentActivityItem => Boolean(item)),
          ),
          isLoading: false,
          errorMessage: null,
        });
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }

        setState({
          data: [],
          isLoading: false,
          errorMessage: getErrorMessage(error, "Unable to load student activity."),
        });
      });

    return () => {
      isMounted = false;
    };
  }, [enabled, progressVersion, reloadKey]);

  return {
    activity: enabled ? state.data : [],
    isLoading: enabled ? state.isLoading : false,
    errorMessage: enabled ? state.errorMessage : null,
    reload: () => setReloadKey((currentKey) => currentKey + 1),
  };
}
