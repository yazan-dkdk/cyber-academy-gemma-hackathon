import type { Course, CourseLessonReference, LessonType } from "@/lib/courses/types";
import {
  getCourseRouteId,
  getLessonRouteId,
  lessonMatchesIdentifier,
} from "@/lib/courses/routing";

export function getOrderedSections(course: Course) {
  return [...course.sections].sort((firstSection, secondSection) => firstSection.order - secondSection.order);
}

export function getOrderedLessonReferences(course: Course): CourseLessonReference[] {
  const courseRouteId = getCourseRouteId(course);

  return getOrderedSections(course).flatMap((section) =>
    [...section.lessons]
      .sort((firstLesson, secondLesson) => firstLesson.order - secondLesson.order)
      .map((lesson) => ({
        courseId: courseRouteId,
        sectionId: section.id,
        sectionTitle: section.title,
        lesson,
        lessonIndex: 0,
      })),
  ).map((reference, lessonIndex) => ({
    ...reference,
    lessonIndex,
  }));
}

export function getOrderedLessonIds(course: Course) {
  return getOrderedLessonReferences(course).map((reference) => reference.lesson.id);
}

export function getLessonCount(course: Course) {
  return getOrderedLessonIds(course).length;
}

export function getDurationMinutes(course: Course) {
  return getOrderedLessonReferences(course).reduce(
    (totalMinutes, reference) => totalMinutes + reference.lesson.durationMinutes,
    0,
  );
}

export function getLessonTypes(course: Course) {
  const lessonTypes = new Set<LessonType>();

  for (const reference of getOrderedLessonReferences(course)) {
    lessonTypes.add(reference.lesson.contentMode ?? reference.lesson.type);
  }

  return Array.from(lessonTypes);
}

export function getCourseCapabilities(course: Course) {
  const lessonTypes = getLessonTypes(course);

  return {
    hasText: lessonTypes.includes("TEXT") || lessonTypes.includes("HYBRID"),
    hasVideo: lessonTypes.includes("VIDEO") || lessonTypes.includes("HYBRID"),
    hasLabs: course.hasLabs,
  };
}

export function findLessonReference(course: Course, lessonId: string) {
  return getOrderedLessonReferences(course).find((reference) =>
    lessonMatchesIdentifier(reference.lesson, lessonId),
  ) ?? null;
}

export function getLessonNavigation(course: Course, lessonId: string) {
  const lessons = getOrderedLessonReferences(course);
  const currentIndex = lessons.findIndex((reference) =>
    lessonMatchesIdentifier(reference.lesson, lessonId),
  );

  if (currentIndex < 0) {
    return {
      current: null,
      previous: null,
      next: null,
    };
  }

  return {
    current: lessons[currentIndex],
    previous: lessons[currentIndex - 1] ?? null,
    next: lessons[currentIndex + 1] ?? null,
  };
}

export function getLessonHref(course: Course, lessonId: string | null | undefined) {
  const courseHref = `/courses/${getCourseRouteId(course)}`;

  if (!lessonId) {
    return courseHref;
  }

  const reference = findLessonReference(course, lessonId);
  return reference ? `${courseHref}/lessons/${getLessonRouteId(reference.lesson)}` : courseHref;
}

export function getSummaryLessonHref(
  course: Pick<Course, "id" | "slug"> & { lessonIds: string[] },
  lessonId: string | null | undefined,
) {
  const courseHref = `/courses/${getCourseRouteId(course)}`;

  if (!lessonId || !course.lessonIds.includes(lessonId)) {
    return courseHref;
  }

  return `${courseHref}/lessons/${lessonId}`;
}
