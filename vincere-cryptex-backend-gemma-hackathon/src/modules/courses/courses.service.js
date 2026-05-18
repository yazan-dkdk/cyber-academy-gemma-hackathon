import { db } from '../../config/db.js';
import { Roles } from '../../shared/constants/roles.js';
import { AppError } from '../../shared/errors/app-error.js';
import { ActivityTypes, EntityTypes, activityService } from '../activity/activity.service.js';
import { quizzesRepository } from '../quizzes/quizzes.repository.js';
import {
  CourseLevels,
  LessonTypes
} from './course.constants.js';
import { coursesRepository } from './courses.repository.js';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const sanitizeCourseSummary = (course) => ({
  id: course.id,
  title: course.title,
  slug: course.slug,
  shortDescription: course.short_description,
  level: course.level,
  publishedAt: course.published_at,
  createdAt: course.created_at,
  updatedAt: course.updated_at
});

const sanitizeLessonSummary = (lesson) => ({
  id: lesson.id,
  title: lesson.title,
  summary: lesson.summary,
  type: lesson.type,
  position: lesson.position,
  videoDurationSeconds: lesson.video_duration_seconds
});

const sanitizeCourseDetails = (course, sections, lessons) => {
  const lessonsBySection = new Map();
  for (const lesson of lessons) {
    const existing = lessonsBySection.get(lesson.section_id) ?? [];
    existing.push(sanitizeLessonSummary(lesson));
    lessonsBySection.set(lesson.section_id, existing);
  }

  return {
    ...sanitizeCourseSummary(course),
    description: course.description,
    sections: sections.map((section) => ({
      id: section.id,
      title: section.title,
      position: section.position,
      lessons: lessonsBySection.get(section.id) ?? []
    }))
  };
};

const sanitizeEnrollment = (enrollment) => ({
  id: enrollment.id,
  userId: enrollment.user_id,
  courseId: enrollment.course_id,
  status: enrollment.status,
  enrolledAt: enrollment.enrolled_at,
  completedAt: enrollment.completed_at,
  lastAccessedAt: enrollment.last_accessed_at,
  createdAt: enrollment.created_at,
  updatedAt: enrollment.updated_at
});

const sanitizeProgress = (progress) => {
  if (!progress) {
    return {
      startedAt: null,
      lastViewedAt: null,
      completedAt: null,
      isCompleted: false
    };
  }

  return {
    startedAt: progress.started_at,
    lastViewedAt: progress.last_viewed_at,
    completedAt: progress.completed_at,
    isCompleted: Boolean(progress.completed_at)
  };
};

const sanitizeLessonDetails = (lesson) => ({
  id: lesson.id,
  title: lesson.title,
  summary: lesson.summary,
  type: lesson.type,
  position: lesson.position,
  createdAt: lesson.created_at,
  updatedAt: lesson.updated_at,
  section: {
    id: lesson.section_id,
    title: lesson.section_title,
    position: lesson.section_position
  },
  content: {
    text: lesson.text_content
      ? {
          body: lesson.text_content
        }
      : null,
    video: lesson.video_provider && lesson.video_asset_id && lesson.video_duration_seconds
      ? {
          provider: lesson.video_provider,
          assetId: lesson.video_asset_id,
          durationSeconds: lesson.video_duration_seconds
        }
      : null
  }
});

const parsePositiveInteger = (value, fallback, fieldName) => {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new AppError(`${fieldName} must be a positive integer`, 400);
  }

  return parsed;
};

const assertUuid = (value, fieldName) => {
  if (!UUID_PATTERN.test(value)) {
    throw new AppError(`Valid ${fieldName} is required`, 400);
  }
};

const assertStudentUser = (user) => {
  if (!user || user.role !== Roles.STUDENT) {
    throw new AppError('Student account required', 403);
  }
};

const normalizeLevel = (level) => {
  if (level === undefined || level === null || level === '') {
    return null;
  }

  const normalizedLevel = String(level).trim().toLowerCase();
  if (!Object.values(CourseLevels).includes(normalizedLevel)) {
    throw new AppError('Invalid course level filter', 400);
  }

  return normalizedLevel;
};

const buildPagination = ({ page, pageSize, total }) => ({
  page,
  pageSize,
  total,
  totalPages: total === 0 ? 0 : Math.ceil(total / pageSize)
});

export const coursesService = {
  listPublishedCourses: async ({ page, pageSize, search, level }) => {
    const currentPage = parsePositiveInteger(page, DEFAULT_PAGE, 'page');
    const currentPageSize = parsePositiveInteger(pageSize, DEFAULT_PAGE_SIZE, 'pageSize');
    if (currentPageSize > MAX_PAGE_SIZE) {
      throw new AppError(`pageSize must be ${MAX_PAGE_SIZE} or fewer`, 400);
    }

    const normalizedSearch = search ? String(search).trim().slice(0, 255) : '';
    const normalizedLevel = normalizeLevel(level);
    const offset = (currentPage - 1) * currentPageSize;

    const { courses, total } = await coursesRepository.listPublishedCourses({
      search: normalizedSearch,
      level: normalizedLevel,
      limit: currentPageSize,
      offset
    });

    return {
      courses: courses.map(sanitizeCourseSummary),
      pagination: buildPagination({
        page: currentPage,
        pageSize: currentPageSize,
        total
      })
    };
  },

  getPublishedCourseDetails: async (courseId) => {
    assertUuid(courseId, 'course id');

    const course = await coursesRepository.findPublishedCourseById(courseId);
    if (!course) {
      throw new AppError('Course not found', 404);
    }

    const { sections, lessons } = await coursesRepository.listPublishedSectionsWithLessons(courseId);
    return sanitizeCourseDetails(course, sections, lessons);
  },

  enrollInCourse: async ({ user, courseId }) => {
    assertStudentUser(user);
    assertUuid(courseId, 'course id');

    const course = await coursesRepository.findPublishedCourseById(courseId);
    if (!course) {
      throw new AppError('Course not found', 404);
    }

    const client = await db.connect();
    let createdEnrollment = null;
    let enrollment = null;

    try {
      await client.query('BEGIN');
      createdEnrollment = await coursesRepository.createEnrollment(user.id, courseId, client);
      enrollment =
        createdEnrollment ??
        (await coursesRepository.findEnrollmentByUserAndCourse(user.id, courseId, client));

      if (!enrollment) {
        throw new AppError('Enrollment could not be created', 500);
      }

      if (createdEnrollment) {
        await activityService.logActivity({
          userId: user.id,
          activityType: ActivityTypes.COURSE_ENROLLED,
          entityType: EntityTypes.COURSE,
          entityId: courseId,
          metadata: {
            courseTitle: course.title
          },
          runner: client
        });
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return {
      enrollment: sanitizeEnrollment(enrollment),
      alreadyEnrolled: !createdEnrollment
    };
  },

  getLessonDetails: async ({ user, courseId, lessonId }) => {
    assertStudentUser(user);
    assertUuid(courseId, 'course id');
    assertUuid(lessonId, 'lesson id');

    const enrollment = await coursesRepository.findEnrollmentByUserAndCourse(user.id, courseId);
    if (!enrollment) {
      throw new AppError('Enrollment required', 403);
    }

    const lesson = await coursesRepository.findPublishedLessonForCourse(courseId, lessonId);
    if (!lesson) {
      throw new AppError('Lesson not found', 404);
    }

    const client = await db.connect();
    let progress = null;
    let updatedEnrollment = enrollment;

    try {
      await client.query('BEGIN');
      updatedEnrollment = await coursesRepository.touchEnrollmentLastAccessed(enrollment.id, client);
      progress = await coursesRepository.upsertLessonViewProgress(
        {
          enrollmentId: enrollment.id,
          userId: user.id,
          courseId,
          lessonId
        },
        client
      );

      if (progress.inserted) {
        await activityService.logActivity({
          userId: user.id,
          activityType: ActivityTypes.LESSON_VIEWED,
          entityType: EntityTypes.LESSON,
          entityId: lessonId,
          metadata: {
            courseId,
            courseTitle: lesson.course_title
          },
          runner: client
        });
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return {
      course: {
        id: lesson.course_id,
        title: lesson.course_title
      },
      enrollment: sanitizeEnrollment(updatedEnrollment ?? enrollment),
      lesson: sanitizeLessonDetails(lesson),
      progress: sanitizeProgress(progress)
    };
  },

  completeLesson: async ({ user, courseId, lessonId }) => {
    assertStudentUser(user);
    assertUuid(courseId, 'course id');
    assertUuid(lessonId, 'lesson id');

    const enrollment = await coursesRepository.findEnrollmentByUserAndCourse(user.id, courseId);
    if (!enrollment) {
      throw new AppError('Enrollment required', 403);
    }

    const lesson = await coursesRepository.findPublishedLessonForCourse(courseId, lessonId);
    if (!lesson) {
      throw new AppError('Lesson not found', 404);
    }

    const publishedQuiz = await quizzesRepository.findQuizForStudent({
      userId: user.id,
      courseId,
      lessonId
    });

    if (publishedQuiz) {
      throw new AppError('Lesson completion requires passing the quiz', 409);
    }

    const client = await db.connect();
    let progress = null;
    let updatedEnrollment = enrollment;

    try {
      await client.query('BEGIN');
      updatedEnrollment = await coursesRepository.touchEnrollmentLastAccessed(enrollment.id, client);
      const existingProgress = await coursesRepository.findLessonProgress(
        {
          userId: user.id,
          lessonId
        },
        client
      );

      progress = await coursesRepository.completeLessonProgress(
        {
          enrollmentId: enrollment.id,
          userId: user.id,
          courseId,
          lessonId
        },
        client
      );

      // Lesson completion here is intentionally scoped to per-lesson progress only.
      // Authoritative course completion rules will be finalized in later modules.
      if (!existingProgress?.completed_at && progress.completed_at) {
        await activityService.logActivity({
          userId: user.id,
          activityType: ActivityTypes.LESSON_COMPLETED,
          entityType: EntityTypes.LESSON,
          entityId: lessonId,
          metadata: {
            courseId,
            courseTitle: lesson.course_title
          },
          runner: client
        });
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    const nextLesson = await coursesRepository.findNextPublishedLesson({
      courseId,
      sectionPosition: lesson.section_position,
      lessonPosition: lesson.position
    });

    return {
      enrollment: sanitizeEnrollment(updatedEnrollment ?? enrollment),
      progress: sanitizeProgress(progress),
      nextLesson: nextLesson
        ? {
            id: nextLesson.id,
            title: nextLesson.title,
            type: nextLesson.type,
            section: {
              id: nextLesson.section_id,
              title: nextLesson.section_title,
              position: nextLesson.section_position
            },
            position: nextLesson.position
          }
        : null
    };
  }
};
