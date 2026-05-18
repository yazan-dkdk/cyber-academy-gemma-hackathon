import { AppError } from '../../shared/errors/app-error.js';
import { activityRepository } from './activity.repository.js';

export const ActivityTypes = Object.freeze({
  COURSE_ENROLLED: 'course.enrolled',
  LESSON_VIEWED: 'lesson.viewed',
  LESSON_COMPLETED: 'lesson.completed',
  QUIZ_STARTED: 'quiz.started',
  QUIZ_SUBMITTED: 'quiz.submitted',
  QUIZ_PASSED: 'quiz.passed',
  CHALLENGE_HINT_USED: 'challenge.hint_used',
  CHALLENGE_SOLVED: 'challenge.solved',
  LAB_STARTED: 'lab.started',
  LAB_RESET: 'lab.reset',
  LAB_TERMINATED: 'lab.terminated'
});

export const EntityTypes = Object.freeze({
  COURSE: 'course',
  LESSON: 'lesson',
  QUIZ: 'quiz',
  CHALLENGE: 'challenge',
  LAB: 'lab'
});

export const activityService = {
  logActivity: async ({ userId, activityType, entityType, entityId, metadata = {}, runner }) => {
    if (!userId) {
      throw new AppError('Activity user is required', 500);
    }

    if (!activityType || !entityType || !entityId) {
      throw new AppError('Incomplete activity log payload', 500);
    }

    await activityRepository.createLog(
      {
        userId,
        activityType,
        entityType,
        entityId,
        metadata
      },
      runner
    );
  }
};
