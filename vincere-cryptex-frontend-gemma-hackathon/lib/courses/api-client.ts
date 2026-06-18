import { logCourseBackendFallback } from "@/lib/courses/fallback-logging";
import { applyCourseLessonVideoOverrides } from "@/lib/courses/local-lesson-video-overrides";
import { getMockCourseById, getMockCourseCatalog } from "@/lib/courses/mock-api";
import { normalizeCourseRouteId } from "@/lib/courses/routing";
import type {
  Course,
  CourseDifficulty,
  CourseLesson,
  CourseSection,
  CourseSummary,
  CourseTone,
  LessonType,
} from "@/lib/courses/types";

const DEFAULT_BACKEND_ORIGIN = "http://localhost:3000";
const COURSE_BACKEND_FETCH_TIMEOUT_MS = 3500;
const FRONTEND_DEV_ORIGINS = new Set([
  "http://localhost:3001",
  "http://127.0.0.1:3001",
]);

type BackendRecord = Record<string, unknown>;

function isRecord(value: unknown): value is BackendRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: BackendRecord | null, keys: string[]) {
  if (!record) {
    return null;
  }

  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function readNumber(record: BackendRecord | null, keys: string[]) {
  if (!record) {
    return null;
  }

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

function readBoolean(record: BackendRecord | null, keys: string[]) {
  if (!record) {
    return null;
  }

  for (const key of keys) {
    const value = record[key];

    if (typeof value === "boolean") {
      return value;
    }
  }

  return null;
}

function readArray(record: BackendRecord | null, keys: string[]) {
  if (!record) {
    return null;
  }

  for (const key of keys) {
    const value = record[key];

    if (Array.isArray(value)) {
      return value;
    }
  }

  return null;
}

function normalizeConfiguredOrigin(value: string | undefined) {
  const configuredValue = value?.trim();

  if (!configuredValue) {
    return DEFAULT_BACKEND_ORIGIN;
  }

  try {
    const origin = new URL(configuredValue).origin;
    return FRONTEND_DEV_ORIGINS.has(origin) ? DEFAULT_BACKEND_ORIGIN : origin;
  } catch {
    return DEFAULT_BACKEND_ORIGIN;
  }
}

function getBackendApiOrigin() {
  return normalizeConfiguredOrigin(process.env.NEXT_PUBLIC_API_BASE_URL);
}

function buildBackendCoursesUrl(path = "") {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getBackendApiOrigin()}/api/courses${normalizedPath === "/" ? "" : normalizedPath}`;
}

async function fetchBackendJson(path = "") {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), COURSE_BACKEND_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(buildBackendCoursesUrl(path), {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Backend course request failed with ${response.status}.`);
    }

    return response.json() as Promise<unknown>;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeDifficulty(value: unknown): CourseDifficulty {
  if (typeof value !== "string") {
    return "beginner";
  }

  const normalizedValue = value.trim().toLowerCase();

  if (normalizedValue === "beginner" || normalizedValue === "intermediate" || normalizedValue === "advanced") {
    return normalizedValue;
  }

  return "beginner";
}

function normalizeTone(value: unknown): CourseTone {
  return value === "cyan" || value === "purple" || value === "pink" || value === "neutral"
    ? value
    : "cyan";
}

function readLessonType(value: unknown): LessonType | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim().toUpperCase();

  if (normalizedValue === "TEXT" || normalizedValue === "VIDEO" || normalizedValue === "HYBRID") {
    return normalizedValue;
  }

  return null;
}

function normalizeLessonMode(contentMode: unknown, type: unknown): LessonType {
  return readLessonType(contentMode) ?? readLessonType(type) ?? "TEXT";
}

function unwrapCourseRecord(payload: unknown) {
  if (!isRecord(payload)) {
    return null;
  }

  const course = payload.course;
  return isRecord(course) ? course : payload;
}

function extractCourseArray(payload: unknown) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!isRecord(payload)) {
    return [];
  }

  for (const key of ["courses", "items", "data", "results"]) {
    const value = payload[key];

    if (Array.isArray(value)) {
      return value;
    }
  }

  const nestedData = payload.data;

  if (isRecord(nestedData)) {
    return extractCourseArray(nestedData);
  }

  return [];
}

function getRouteIdFromCourseRecord(record: BackendRecord) {
  const backendId = readString(record, ["id", "_id", "courseId", "courseID"]);
  const slug = readString(record, ["slug", "courseSlug", "publicSlug", "publicId", "routeId"]);
  return normalizeCourseRouteId(slug ?? backendId) ?? backendId ?? "course";
}

function getBackendIdFromCourseRecord(record: BackendRecord, routeId: string) {
  const backendId = readString(record, ["id", "_id", "courseId", "courseID"]);
  const normalizedBackendId = normalizeCourseRouteId(backendId);
  return normalizedBackendId && normalizedBackendId !== routeId ? backendId : null;
}

function getRouteIdFromLessonRecord(record: BackendRecord) {
  const backendId = readString(record, ["id", "_id", "lessonId", "lessonID"]);
  const slug = readString(record, ["slug", "lessonSlug", "publicSlug", "publicId", "routeId"]);
  return normalizeCourseRouteId(slug ?? backendId) ?? backendId ?? "lesson";
}

function getBackendIdFromLessonRecord(record: BackendRecord, routeId: string) {
  const backendId = readString(record, ["id", "_id", "lessonId", "lessonID"]);
  const normalizedBackendId = normalizeCourseRouteId(backendId);
  return normalizedBackendId && normalizedBackendId !== routeId ? backendId : null;
}

function normalizeArticleContent(record: BackendRecord) {
  const paragraphs = readArray(record, ["articleContent", "paragraphs"]);

  if (paragraphs) {
    return paragraphs.filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
  }

  const text =
    readString(record, ["textContent", "text", "content", "body", "description"]) ??
    readString(record, ["summary"]);

  if (!text) {
    return [];
  }

  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function normalizeBackendLesson(value: unknown, lessonIndex: number): CourseLesson | null {
  if (!isRecord(value)) {
    return null;
  }

  const quizRecord = isRecord(value.quiz) ? value.quiz : null;
  const id = getRouteIdFromLessonRecord(value);
  const contentMode = readLessonType(value.contentMode);
  const type = normalizeLessonMode(value.contentMode, value.type ?? value.lessonType);
  const durationMinutes =
    Math.round(
      readNumber(value, ["durationMinutes", "estimatedDurationMinutes", "duration"]) ??
        ((readNumber(value, ["durationSeconds", "videoDurationSeconds"]) ?? 0) / 60),
    ) || 0;
  const media = value.media ?? value.video ?? value.mediaMetadata ?? value.videoMetadata ?? value.protectedMedia ?? null;
  const articleContent = normalizeArticleContent(value);

  return {
    id,
    backendId: getBackendIdFromLessonRecord(value, id),
    slug: readString(value, ["slug", "lessonSlug", "publicSlug", "publicId", "routeId"]) ?? id,
    title: readString(value, ["title", "name"]) ?? "Lesson",
    type,
    contentMode,
    text:
      readString(value, ["textContent", "text", "content", "body"]) ??
      (articleContent.length ? articleContent.join("\n\n") : null),
    video: value.video ?? null,
    protectedMedia: value.protectedMedia ?? value.protectedSession ?? null,
    media,
    hasQuiz: readBoolean(value, ["hasQuiz", "quizAvailable"]) ?? readBoolean(quizRecord, ["hasQuiz"]) ?? null,
    quizId: readString(value, ["quizId", "quizID"]) ?? readString(quizRecord, ["id", "quizId"]) ?? null,
    quizPassed: readBoolean(value, ["quizPassed", "hasPassedQuiz"]) ?? null,
    durationMinutes,
    order: Math.round(readNumber(value, ["order", "position"]) ?? lessonIndex + 1),
    isLocked: readBoolean(value, ["isLocked", "locked"]) ?? null,
    summary: readString(value, ["summary", "description"]) ?? "",
    articleContent,
  };
}

function normalizeBackendSections(record: BackendRecord): CourseSection[] {
  return (readArray(record, ["sections", "modules"]) ?? [])
    .map((section, sectionIndex) => {
      if (!isRecord(section)) {
        return null;
      }

      const lessons = (readArray(section, ["lessons", "items"]) ?? [])
        .map((lesson, lessonIndex) => normalizeBackendLesson(lesson, lessonIndex))
        .filter((lesson): lesson is CourseLesson => Boolean(lesson));

      return {
        id: readString(section, ["id", "_id", "sectionId"]) ?? `section-${sectionIndex + 1}`,
        title: readString(section, ["title", "name"]) ?? `Section ${sectionIndex + 1}`,
        description: readString(section, ["description", "summary"]) ?? "",
        order: Math.round(readNumber(section, ["order", "position"]) ?? sectionIndex + 1),
        lessons,
      };
    })
    .filter((section): section is CourseSection => Boolean(section));
}

function getLessonTypes(sections: CourseSection[]) {
  return Array.from(
    new Set(sections.flatMap((section) => section.lessons.map((lesson) => lesson.contentMode ?? lesson.type))),
  );
}

function getLessonIds(sections: CourseSection[]) {
  return sections
    .flatMap((section) => section.lessons)
    .sort((firstLesson, secondLesson) => firstLesson.order - secondLesson.order)
    .map((lesson) => lesson.id);
}

function getDurationMinutes(sections: CourseSection[]) {
  return sections
    .flatMap((section) => section.lessons)
    .reduce((totalMinutes, lesson) => totalMinutes + lesson.durationMinutes, 0);
}

function normalizeBackendCourseSummary(value: unknown): CourseSummary | null {
  const record = unwrapCourseRecord(value);

  if (!record) {
    return null;
  }

  const id = getRouteIdFromCourseRecord(record);
  const sections = normalizeBackendSections(record);
  const lessonIds = getLessonIds(sections);
  const publishedAt = readString(record, ["publishedAt"]);
  const lessonCount = Math.round(readNumber(record, ["lessonCount", "lessonsCount", "totalLessons"]) ?? lessonIds.length);
  const sectionCount = Math.round(readNumber(record, ["sectionCount", "sectionsCount"]) ?? sections.length);
  const durationMinutes = Math.round(readNumber(record, ["durationMinutes", "duration"]) ?? getDurationMinutes(sections));

  return {
    id,
    backendId: getBackendIdFromCourseRecord(record, id),
    slug: readString(record, ["slug", "courseSlug", "publicSlug", "publicId", "routeId"]) ?? id,
    source: "backend",
    title: readString(record, ["title", "name"]) ?? "Course",
    category: readString(record, ["category", "discipline", "skill"]) ?? "Cybersecurity",
    shortDescription:
      readString(record, ["shortDescription", "summary", "description"]) ??
      "Cybersecurity training course.",
    difficulty: normalizeDifficulty(record.level ?? record.difficulty),
    tone: normalizeTone(record.tone),
    hasLabs: readBoolean(record, ["hasLabs"]) ?? false,
    isPublished: readBoolean(record, ["isPublished", "published"]) ?? Boolean(publishedAt),
    isVisible: readBoolean(record, ["isVisible", "visible"]) ?? true,
    lessonCount,
    sectionCount,
    durationMinutes,
    lessonTypes: getLessonTypes(sections),
    lessonIds,
  };
}

function normalizeBackendCourseDetail(value: unknown): Course | null {
  const record = unwrapCourseRecord(value);

  if (!record) {
    return null;
  }

  const id = getRouteIdFromCourseRecord(record);
  const sections = normalizeBackendSections(record);
  const publishedAt = readString(record, ["publishedAt"]);

  return applyCourseLessonVideoOverrides({
    id,
    backendId: getBackendIdFromCourseRecord(record, id),
    slug: readString(record, ["slug", "courseSlug", "publicSlug", "publicId", "routeId"]) ?? id,
    source: "backend",
    title: readString(record, ["title", "name"]) ?? "Course",
    category: readString(record, ["category", "discipline", "skill"]) ?? "Cybersecurity",
    shortDescription:
      readString(record, ["shortDescription", "summary"]) ??
      readString(record, ["description"]) ??
      "Cybersecurity training course.",
    fullDescription:
      readString(record, ["fullDescription", "description", "body"]) ??
      readString(record, ["shortDescription", "summary"]) ??
      "Cybersecurity training course.",
    difficulty: normalizeDifficulty(record.level ?? record.difficulty),
    tone: normalizeTone(record.tone),
    hasLabs: readBoolean(record, ["hasLabs"]) ?? false,
    isPublished: readBoolean(record, ["isPublished", "published"]) ?? Boolean(publishedAt),
    isVisible: readBoolean(record, ["isVisible", "visible"]) ?? true,
    sections,
  });
}

async function enrichBackendCatalogWithDetails(courses: CourseSummary[]) {
  const detailedCourses = await Promise.all(
    courses.map(async (course) => {
      try {
        const payload = await fetchBackendJson(`/${encodeURIComponent(course.slug ?? course.id)}`);
        const detail = normalizeBackendCourseDetail(payload);

        if (!detail) {
          return course;
        }

        const sections = detail.sections;

        return {
          ...course,
          lessonCount: sections.flatMap((section) => section.lessons).length || course.lessonCount,
          sectionCount: sections.length || course.sectionCount,
          durationMinutes: getDurationMinutes(sections) || course.durationMinutes,
          lessonTypes: getLessonTypes(sections),
          lessonIds: getLessonIds(sections),
        };
      } catch {
        return course;
      }
    }),
  );

  return detailedCourses;
}

export async function fetchCourseCatalog(route = "/courses") {
  try {
    const payload = await fetchBackendJson();
    const backendCourses = extractCourseArray(payload)
      .map(normalizeBackendCourseSummary)
      .filter((course): course is CourseSummary => Boolean(course));

    if (!backendCourses.length) {
      logCourseBackendFallback(route, "backend_empty_catalog");
      return getMockCourseCatalog();
    }

    return enrichBackendCatalogWithDetails(backendCourses);
  } catch {
    logCourseBackendFallback(route, "backend_fetch_failed");
    return getMockCourseCatalog();
  }
}

export async function fetchCourse(id: string, route = `/courses/${id}`) {
  try {
    const payload = await fetchBackendJson(`/${encodeURIComponent(id)}`);
    const backendCourse = normalizeBackendCourseDetail(payload);

    if (!backendCourse) {
      logCourseBackendFallback(route, "backend_course_payload_missing");
      return getMockCourseById(id);
    }

    return backendCourse;
  } catch {
    logCourseBackendFallback(route, "backend_fetch_failed");
    return getMockCourseById(id);
  }
}

export async function fetchCourseCatalogFromMockApi() {
  return fetchCourseCatalog();
}

export async function fetchCourseFromMockApi(id: string) {
  return fetchCourse(id);
}
