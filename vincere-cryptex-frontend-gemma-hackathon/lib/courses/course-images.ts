import type { CourseSummary } from "@/lib/courses/types";
import { normalizeCourseRouteId } from "@/lib/courses/routing";

type CourseWithOptionalSlug = Pick<CourseSummary, "id" | "title"> & {
  slug?: string | null;
};

export function getCourseSlug(course: CourseWithOptionalSlug) {
  if (course.slug) {
    return course.slug;
  }

  return course.title
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getCourseImagePath(course: CourseWithOptionalSlug) {
  return `/images/02-courses/${normalizeCourseRouteId(getCourseSlug(course)) ?? getCourseSlug(course)}.png`;
}
