import { Router } from 'express';
import { Roles } from '../../shared/constants/roles.js';
import { requireAuth, requireRoles } from '../../shared/middleware/auth.middleware.js';
import { asyncHandler } from '../../shared/utils/async-handler.js';
import { coursesController } from './courses.controller.js';

export const coursesRouter = Router();

coursesRouter.get('/', asyncHandler(coursesController.listPublishedCourses));
coursesRouter.get('/:courseId', asyncHandler(coursesController.getPublishedCourseDetails));

coursesRouter.post(
  '/:courseId/enroll',
  requireAuth,
  requireRoles(Roles.STUDENT),
  asyncHandler(coursesController.enrollInCourse)
);

coursesRouter.get(
  '/:courseId/lessons/:lessonId',
  requireAuth,
  requireRoles(Roles.STUDENT),
  asyncHandler(coursesController.getLessonDetails)
);

coursesRouter.post(
  '/:courseId/lessons/:lessonId/complete',
  requireAuth,
  requireRoles(Roles.STUDENT),
  asyncHandler(coursesController.completeLesson)
);
