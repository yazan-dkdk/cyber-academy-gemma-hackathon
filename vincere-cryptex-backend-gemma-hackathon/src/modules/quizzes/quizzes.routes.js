import { Router } from 'express';
import { Roles } from '../../shared/constants/roles.js';
import { requireAuth, requireRoles } from '../../shared/middleware/auth.middleware.js';
import { asyncHandler } from '../../shared/utils/async-handler.js';
import { quizzesController } from './quizzes.controller.js';

export const quizzesRouter = Router();

const studentOnlyMiddleware = [requireAuth, requireRoles(Roles.STUDENT)];

quizzesRouter.get(
  '/courses/:courseId/quiz',
  ...studentOnlyMiddleware,
  asyncHandler(quizzesController.getCourseQuiz)
);

quizzesRouter.post(
  '/courses/:courseId/quiz/attempts',
  ...studentOnlyMiddleware,
  asyncHandler(quizzesController.startCourseQuizAttempt)
);

quizzesRouter.get(
  '/courses/:courseId/lessons/:lessonId/quiz',
  ...studentOnlyMiddleware,
  asyncHandler(quizzesController.getLessonQuiz)
);

quizzesRouter.post(
  '/courses/:courseId/lessons/:lessonId/quiz/attempts',
  ...studentOnlyMiddleware,
  asyncHandler(quizzesController.startLessonQuizAttempt)
);

quizzesRouter.post(
  '/quiz-attempts/:attemptId/submit',
  ...studentOnlyMiddleware,
  asyncHandler(quizzesController.submitQuizAttempt)
);

quizzesRouter.get(
  '/quiz-attempts/:attemptId/result',
  ...studentOnlyMiddleware,
  asyncHandler(quizzesController.getSubmittedAttemptResult)
);
