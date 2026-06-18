import { lessonMatchesIdentifier, normalizeCourseRouteId } from "@/lib/courses/routing";
import type { Course, CourseLesson, LessonType } from "@/lib/courses/types";

export const NDF_TRAFFIC_MAP_VIDEO_PATH =
  "/media/courses/network-defense-foundations/ndf-traffic-map.mp4";
export const NDF_PACKET_VIEW_VIDEO_PATH =
  "/media/courses/network-defense-foundations/ndf-packet-view.mp4";
export const NDF_SERVICE_REVIEW_VIDEO_PATH =
  "/media/courses/network-defense-foundations/ndf-service-review.mp4";

type LocalLessonVideoOverride = {
  courseId: string;
  lessonId: string;
  mode: Extract<LessonType, "VIDEO" | "HYBRID">;
  video: {
    src: string;
    contentType: string;
    title: string;
  };
};

const localLessonVideoOverrides: LocalLessonVideoOverride[] = [
  {
    courseId: "network-defense-foundations",
    lessonId: "ndf-traffic-map",
    mode: "HYBRID",
    video: {
      src: NDF_TRAFFIC_MAP_VIDEO_PATH,
      contentType: "video/mp4",
      title: "Reading the Traffic Map",
    },
  },
  {
    courseId: "network-defense-foundations",
    lessonId: "ndf-packet-view",
    mode: "HYBRID",
    video: {
      src: NDF_PACKET_VIEW_VIDEO_PATH,
      contentType: "video/mp4",
      title: "Packet Capture Walkthrough",
    },
  },
  {
    courseId: "network-defense-foundations",
    lessonId: "ndf-service-review",
    mode: "HYBRID",
    video: {
      src: NDF_SERVICE_REVIEW_VIDEO_PATH,
      contentType: "video/mp4",
      title: "Service Exposure Review",
    },
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function courseMatchesOverride(course: Course, override: LocalLessonVideoOverride) {
  const overrideCourseId = normalizeCourseRouteId(override.courseId);
  const courseIdentifiers = [course.id, course.slug, course.backendId]
    .map((identifier) => normalizeCourseRouteId(identifier))
    .filter(Boolean);

  return Boolean(overrideCourseId && courseIdentifiers.includes(overrideCourseId));
}

function mergeVideoIntoMedia(media: unknown, video: LocalLessonVideoOverride["video"]) {
  return isRecord(media) ? { ...media, video } : { video };
}

function applyLessonVideoOverride(
  lesson: CourseLesson,
  override: LocalLessonVideoOverride,
): CourseLesson {
  return {
    ...lesson,
    type: override.mode,
    contentMode: override.mode,
    video: override.video,
    media: mergeVideoIntoMedia(lesson.media, override.video),
  };
}

export function getLocalLessonModeOverride(
  courseId: string | null | undefined,
  lessonId: string | null | undefined,
) {
  const normalizedCourseId = normalizeCourseRouteId(courseId);

  if (!normalizedCourseId || !lessonId) {
    return null;
  }

  return (
    localLessonVideoOverrides.find(
      (override) =>
        normalizeCourseRouteId(override.courseId) === normalizedCourseId &&
        normalizeCourseRouteId(override.lessonId) === normalizeCourseRouteId(lessonId),
    )?.mode ?? null
  );
}

export function applyCourseLessonVideoOverrides(course: Course): Course {
  const matchingOverrides = localLessonVideoOverrides.filter((override) =>
    courseMatchesOverride(course, override),
  );

  if (!matchingOverrides.length) {
    return course;
  }

  let hasChanges = false;
  const sections = course.sections.map((section) => ({
    ...section,
    lessons: section.lessons.map((lesson) => {
      const override = matchingOverrides.find((item) =>
        lessonMatchesIdentifier(lesson, item.lessonId),
      );

      if (!override) {
        return lesson;
      }

      hasChanges = true;
      return applyLessonVideoOverride(lesson, override);
    }),
  }));

  return hasChanges ? { ...course, sections } : course;
}
