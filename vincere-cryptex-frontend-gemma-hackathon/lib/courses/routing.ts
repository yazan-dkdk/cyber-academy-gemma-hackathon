import type { Course, CourseLesson, CourseSummary } from "@/lib/courses/types";

type CourseRouteLike = Pick<Course | CourseSummary, "id" | "slug">;
type LessonRouteLike = Pick<CourseLesson, "id" | "backendId" | "slug">;

const courseSlugAliases: Record<string, string> = {
  "web-app-attack-lab": "web-application-attack-lab",
  "incident-response-ops": "incident-response-operations",
};

export function normalizeRouteValue(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? null;
}

export function normalizeCourseRouteId(value: string | null | undefined) {
  const normalizedValue = normalizeRouteValue(value);

  if (!normalizedValue) {
    return null;
  }

  return courseSlugAliases[normalizedValue] ?? normalizedValue;
}

export function getCourseRouteId(course: CourseRouteLike) {
  return normalizeCourseRouteId(course.slug ?? course.id) ?? course.id;
}

export function getLessonRouteId(lesson: LessonRouteLike) {
  return lesson.slug ?? lesson.id;
}

export function lessonMatchesIdentifier(
  lesson: LessonRouteLike,
  identifier: string | null | undefined,
) {
  const normalizedIdentifier = normalizeRouteValue(identifier);

  if (!normalizedIdentifier) {
    return false;
  }

  return [lesson.id, lesson.slug, lesson.backendId].some(
    (value) => normalizeRouteValue(value) === normalizedIdentifier,
  );
}

export function getCourseHref(course: CourseRouteLike) {
  return `/courses/${getCourseRouteId(course)}`;
}
