import { db } from '../../config/db.js';
import {
  CourseStatuses,
  EnrollmentStatuses,
  LessonStatuses,
  SectionStatuses
} from './course.constants.js';

const COURSE_PUBLIC_SELECT = `
  c.id,
  c.title,
  c.slug,
  c.short_description,
  c.description,
  c.level,
  c.published_at,
  c.created_at,
  c.updated_at
`;

const LESSON_SUMMARY_SELECT = `
  l.id,
  l.title,
  l.summary,
  l.type,
  l.position,
  l.video_duration_seconds
`;

const buildCourseFilters = ({ search, level }) => {
  const values = [CourseStatuses.PUBLISHED];
  const conditions = ['c.status = $1'];

  if (search) {
    values.push(search);
    const param = `$${values.length}`;
    conditions.push(
      `(LOWER(c.title) LIKE '%' || LOWER(${param}) || '%' OR LOWER(c.short_description) LIKE '%' || LOWER(${param}) || '%')`
    );
  }

  if (level) {
    values.push(level);
    conditions.push(`c.level = $${values.length}`);
  }

  return {
    values,
    whereClause: `WHERE ${conditions.join(' AND ')}`
  };
};

export const coursesRepository = {
  listPublishedCourses: async ({ search, level, limit, offset }) => {
    const { values, whereClause } = buildCourseFilters({ search, level });
    const paginationValues = [...values, limit, offset];
    const limitParam = `$${values.length + 1}`;
    const offsetParam = `$${values.length + 2}`;

    const [coursesResult, countResult] = await Promise.all([
      db.query(
        `SELECT ${COURSE_PUBLIC_SELECT}
         FROM courses c
         ${whereClause}
         ORDER BY c.published_at DESC NULLS LAST, c.created_at DESC
         LIMIT ${limitParam}
         OFFSET ${offsetParam}`,
        paginationValues
      ),
      db.query(
        `SELECT COUNT(*)::INT AS total
         FROM courses c
         ${whereClause}`,
        values
      )
    ]);

    return {
      courses: coursesResult.rows,
      total: countResult.rows[0]?.total ?? 0
    };
  },

  findPublishedCourseById: async (courseId, runner = db) => {
    const result = await runner.query(
      `SELECT ${COURSE_PUBLIC_SELECT}
       FROM courses c
       WHERE c.id = $1
         AND c.status = $2
       LIMIT 1`,
      [courseId, CourseStatuses.PUBLISHED]
    );

    return result.rows[0] ?? null;
  },

  listPublishedSectionsWithLessons: async (courseId, runner = db) => {
    const sectionsResult = await runner.query(
      `SELECT
         s.id,
         s.title,
         s.position
       FROM sections s
       WHERE s.course_id = $1
         AND s.status = $2
       ORDER BY s.position ASC`,
      [courseId, SectionStatuses.PUBLISHED]
    );

    const lessonsResult = await runner.query(
      `SELECT
         s.id AS section_id,
         ${LESSON_SUMMARY_SELECT}
       FROM lessons l
       INNER JOIN sections s ON s.id = l.section_id
       WHERE l.course_id = $1
         AND l.status = $2
         AND s.status = $3
       ORDER BY s.position ASC, l.position ASC`,
      [courseId, LessonStatuses.PUBLISHED, SectionStatuses.PUBLISHED]
    );

    return {
      sections: sectionsResult.rows,
      lessons: lessonsResult.rows
    };
  },

  findEnrollmentByUserAndCourse: async (userId, courseId, runner = db) => {
    const result = await runner.query(
      `SELECT
         id,
         user_id,
         course_id,
         status,
         enrolled_at,
         completed_at,
         last_accessed_at,
         created_at,
         updated_at
       FROM enrollments
       WHERE user_id = $1
         AND course_id = $2
       LIMIT 1`,
      [userId, courseId]
    );

    return result.rows[0] ?? null;
  },

  createEnrollment: async (userId, courseId, runner = db) => {
    const result = await runner.query(
      `INSERT INTO enrollments (user_id, course_id, status)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, course_id) DO NOTHING
       RETURNING
         id,
         user_id,
         course_id,
         status,
         enrolled_at,
         completed_at,
         last_accessed_at,
         created_at,
         updated_at`,
      [userId, courseId, EnrollmentStatuses.ACTIVE]
    );

    return result.rows[0] ?? null;
  },

  touchEnrollmentLastAccessed: async (enrollmentId, runner = db) => {
    const result = await runner.query(
      `UPDATE enrollments
       SET last_accessed_at = NOW(), updated_at = NOW()
       WHERE id = $1
       RETURNING
         id,
         user_id,
         course_id,
         status,
         enrolled_at,
         completed_at,
         last_accessed_at,
         created_at,
         updated_at`,
      [enrollmentId]
    );

    return result.rows[0] ?? null;
  },

  setEnrollmentStatus: async ({ enrollmentId, status, completedAt }, runner = db) => {
    const result = await runner.query(
      `UPDATE enrollments
       SET status = $2,
           completed_at = $3,
           updated_at = NOW()
       WHERE id = $1
       RETURNING
         id,
         user_id,
         course_id,
         status,
         enrolled_at,
         completed_at,
         last_accessed_at,
         created_at,
         updated_at`,
      [enrollmentId, status, completedAt]
    );

    return result.rows[0] ?? null;
  },

  findPublishedLessonForCourse: async (courseId, lessonId, runner = db) => {
    const result = await runner.query(
      `SELECT
         c.id AS course_id,
         c.title AS course_title,
         s.id AS section_id,
         s.title AS section_title,
         s.position AS section_position,
         l.id,
         l.title,
         l.summary,
         l.type,
         l.position,
         l.text_content,
         l.video_provider,
         l.video_asset_id,
         l.video_duration_seconds,
         l.created_at,
         l.updated_at
       FROM lessons l
       INNER JOIN courses c ON c.id = l.course_id
       INNER JOIN sections s ON s.id = l.section_id
       WHERE c.id = $1
         AND l.id = $2
         AND c.status = $3
         AND l.status = $4
         AND s.status = $5
       LIMIT 1`,
      [
        courseId,
        lessonId,
        CourseStatuses.PUBLISHED,
        LessonStatuses.PUBLISHED,
        SectionStatuses.PUBLISHED
      ]
    );

    return result.rows[0] ?? null;
  },

  upsertLessonViewProgress: async ({ enrollmentId, userId, courseId, lessonId }, runner = db) => {
    const result = await runner.query(
      `INSERT INTO lesson_progress (enrollment_id, user_id, course_id, lesson_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, lesson_id)
       DO UPDATE SET
         enrollment_id = EXCLUDED.enrollment_id,
         course_id = EXCLUDED.course_id,
         last_viewed_at = NOW(),
         updated_at = NOW()
       RETURNING
         id,
         enrollment_id,
         user_id,
         course_id,
         lesson_id,
         started_at,
         last_viewed_at,
         completed_at,
         created_at,
         updated_at,
         (xmax = 0) AS inserted`,
      [enrollmentId, userId, courseId, lessonId]
    );

    return result.rows[0];
  },

  completeLessonProgress: async ({ enrollmentId, userId, courseId, lessonId }, runner = db) => {
    const result = await runner.query(
      `INSERT INTO lesson_progress (enrollment_id, user_id, course_id, lesson_id, completed_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (user_id, lesson_id)
       DO UPDATE SET
         enrollment_id = EXCLUDED.enrollment_id,
         course_id = EXCLUDED.course_id,
         last_viewed_at = NOW(),
         completed_at = COALESCE(lesson_progress.completed_at, NOW()),
         updated_at = NOW()
       RETURNING
         id,
         enrollment_id,
         user_id,
         course_id,
         lesson_id,
         started_at,
         last_viewed_at,
         completed_at,
         created_at,
         updated_at`,
      [enrollmentId, userId, courseId, lessonId]
    );

    return result.rows[0];
  },

  countPublishedLessonsByCourse: async (courseId, runner = db) => {
    const result = await runner.query(
      `SELECT COUNT(*)::INT AS total
       FROM lessons l
       INNER JOIN sections s ON s.id = l.section_id
       WHERE l.course_id = $1
         AND l.status = $2
         AND s.status = $3`,
      [courseId, LessonStatuses.PUBLISHED, SectionStatuses.PUBLISHED]
    );

    return result.rows[0]?.total ?? 0;
  },

  countCompletedLessonsByEnrollment: async (enrollmentId, runner = db) => {
    const result = await runner.query(
      `SELECT COUNT(*)::INT AS total
       FROM lesson_progress
       WHERE enrollment_id = $1
         AND completed_at IS NOT NULL`,
      [enrollmentId]
    );

    return result.rows[0]?.total ?? 0;
  },

  findLessonProgress: async ({ userId, lessonId }, runner = db) => {
    const result = await runner.query(
      `SELECT
         id,
         enrollment_id,
         user_id,
         course_id,
         lesson_id,
         started_at,
         last_viewed_at,
         completed_at,
         created_at,
         updated_at
       FROM lesson_progress
       WHERE user_id = $1
         AND lesson_id = $2
       LIMIT 1`,
      [userId, lessonId]
    );

    return result.rows[0] ?? null;
  },

  findNextPublishedLesson: async ({ courseId, sectionPosition, lessonPosition }, runner = db) => {
    const result = await runner.query(
      `SELECT
         l.id,
         l.title,
         l.type,
         s.id AS section_id,
         s.title AS section_title,
         s.position AS section_position,
         l.position
       FROM lessons l
       INNER JOIN sections s ON s.id = l.section_id
       WHERE l.course_id = $1
         AND l.status = $2
         AND s.status = $5
         AND (
           s.position > $3
           OR (s.position = $3 AND l.position > $4)
         )
       ORDER BY s.position ASC, l.position ASC
       LIMIT 1`,
      [
        courseId,
        LessonStatuses.PUBLISHED,
        sectionPosition,
        lessonPosition,
        SectionStatuses.PUBLISHED
      ]
    );

    return result.rows[0] ?? null;
  }
};
