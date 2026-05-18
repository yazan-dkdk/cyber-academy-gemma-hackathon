import { mockCourses } from "@/lib/courses/mock-data";
import type { Course, CourseSummary } from "@/lib/courses/types";
import { normalizeCourseRouteId } from "@/lib/courses/routing";
import {
  getDurationMinutes,
  getLessonCount,
  getLessonTypes,
  getOrderedLessonIds,
} from "@/lib/courses/structure";

const MOCK_API_DELAY_MS = 120;

function waitForMockApi() {
  return new Promise((resolve) => {
    setTimeout(resolve, MOCK_API_DELAY_MS);
  });
}

export function toCourseSummary(course: Course): CourseSummary {
  return {
    id: course.id,
    backendId: course.backendId,
    slug: course.slug ?? course.id,
    source: course.source,
    title: course.title,
    category: course.category,
    shortDescription: course.shortDescription,
    difficulty: course.difficulty,
    tone: course.tone,
    hasLabs: course.hasLabs,
    isPublished: course.isPublished,
    isVisible: course.isVisible,
    lessonCount: getLessonCount(course),
    sectionCount: course.sections.length,
    durationMinutes: getDurationMinutes(course),
    lessonTypes: getLessonTypes(course),
    lessonIds: getOrderedLessonIds(course),
  };
}

export async function getMockCourseCatalog() {
  await waitForMockApi();

  return mockCourses.map(toCourseSummary);
}

export async function getMockCourseById(id: string) {
  await waitForMockApi();
  const routeId = normalizeCourseRouteId(id);

  return mockCourses.find((course) => normalizeCourseRouteId(course.slug ?? course.id) === routeId) ?? null;
}
