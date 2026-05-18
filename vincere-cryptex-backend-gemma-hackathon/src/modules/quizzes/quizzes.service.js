import { db } from '../../config/db.js';
import { Roles } from '../../shared/constants/roles.js';
import { AppError } from '../../shared/errors/app-error.js';
import { ActivityTypes, EntityTypes, activityService } from '../activity/activity.service.js';
import { coursesRepository } from '../courses/courses.repository.js';
import { QuizAttemptStatuses } from './quiz.constants.js';
import { quizzesRepository } from './quizzes.repository.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

const sanitizeQuiz = (quiz) => ({
  id: quiz.id,
  courseId: quiz.course_id,
  lessonId: quiz.lesson_id,
  targetType: quiz.target_type,
  title: quiz.title,
  description: quiz.description,
  passPercentage: quiz.pass_percentage,
  totalQuestions: quiz.total_questions,
  publishedAt: quiz.published_at,
  createdAt: quiz.created_at,
  updatedAt: quiz.updated_at
});

const sanitizeQuestion = (question) => ({
  id: question.id,
  type: question.type,
  prompt: question.prompt,
  position: question.position,
  choices: question.choices.map((choice) => ({
    id: choice.id,
    choiceText: choice.choice_text,
    position: choice.position
  }))
});

const sanitizeAttempt = (attempt) => ({
  id: attempt.id,
  quizId: attempt.quiz_id,
  courseId: attempt.course_id,
  lessonId: attempt.lesson_id,
  status: attempt.status,
  passPercentage: attempt.pass_percentage,
  totalQuestions: attempt.total_questions,
  answeredQuestions: attempt.answered_questions,
  correctAnswers: attempt.correct_answers,
  scorePercentage: attempt.score_percentage,
  passed: attempt.passed,
  startedAt: attempt.started_at,
  submittedAt: attempt.submitted_at,
  createdAt: attempt.created_at,
  updatedAt: attempt.updated_at
});

const sanitizeStudentResult = (attempt) => ({
  attemptId: attempt.id,
  quizId: attempt.quiz_id,
  totalQuestions: attempt.total_questions,
  answeredQuestions: attempt.answered_questions,
  correctAnswers: attempt.correct_answers,
  scorePercentage: attempt.score_percentage,
  passed: attempt.passed,
  submittedAt: attempt.submitted_at
});

const sanitizeProgress = (progress) => {
  if (!progress) {
    return null;
  }

  return {
    startedAt: progress.started_at,
    lastViewedAt: progress.last_viewed_at,
    completedAt: progress.completed_at,
    isCompleted: Boolean(progress.completed_at)
  };
};

const buildQuestionIndex = (questions) => {
  const questionMap = new Map();

  for (const question of questions) {
    const correctChoices = question.choices.filter((choice) => choice.is_correct);
    if (question.type !== 'mcq' || question.choices.length < 2 || correctChoices.length !== 1) {
      throw new AppError('Quiz is not ready for submission', 409);
    }

    questionMap.set(question.id, {
      questionId: question.id,
      choicesById: new Map(question.choices.map((choice) => [choice.id, choice])),
      correctChoiceId: correctChoices[0].id
    });
  }

  return questionMap;
};

const normalizeSubmittedAnswers = (answers) => {
  if (!Array.isArray(answers)) {
    throw new AppError('Answers must be an array', 400);
  }

  if (answers.length === 0) {
    throw new AppError('Quiz answers are required', 400);
  }

  const normalized = [];
  const seenQuestionIds = new Set();

  for (const answer of answers) {
    if (!answer || typeof answer !== 'object') {
      throw new AppError('Each answer must be an object', 400);
    }

    const questionId = answer.questionId;
    const choiceId = answer.choiceId;

    assertUuid(questionId, 'question id');
    assertUuid(choiceId, 'choice id');

    if (seenQuestionIds.has(questionId)) {
      throw new AppError('Each question must be answered exactly once', 400);
    }

    seenQuestionIds.add(questionId);
    normalized.push({ questionId, choiceId });
  }

  return normalized;
};

const assertCompleteSubmission = (submittedAnswers, questionMap) => {
  if (submittedAnswers.length !== questionMap.size) {
    throw new AppError('All quiz questions must be answered', 400);
  }

  for (const answer of submittedAnswers) {
    const question = questionMap.get(answer.questionId);
    if (!question) {
      throw new AppError('Submitted answers do not match this quiz', 400);
    }

    if (!question.choicesById.has(answer.choiceId)) {
      throw new AppError('Submitted choice does not belong to the question', 400);
    }
  }
};

const calculateScore = (submittedAnswers, questionMap) => {
  let correctAnswers = 0;

  for (const answer of submittedAnswers) {
    const question = questionMap.get(answer.questionId);
    if (question.correctChoiceId === answer.choiceId) {
      correctAnswers += 1;
    }
  }

  const totalQuestions = questionMap.size;
  const answeredQuestions = submittedAnswers.length;
  const scorePercentage = Math.round((correctAnswers / totalQuestions) * 100);

  return {
    totalQuestions,
    answeredQuestions,
    correctAnswers,
    scorePercentage
  };
};

const getAccessibleQuizForStudent = async ({ userId, courseId, lessonId = null }, runner = db) => {
  const quizPayload = await quizzesRepository.findQuizForStudent(
    {
      userId,
      courseId,
      lessonId
    },
    runner
  );

  if (!quizPayload) {
    throw new AppError('Quiz not found', 404);
  }

  return quizPayload;
};

const getProgressAfterQuizSubmission = async ({ attempt, userId, passed }, runner) => {
  if (!attempt.lesson_id) {
    return null;
  }

  if (passed) {
    return coursesRepository.completeLessonProgress(
      {
        enrollmentId: attempt.enrollment_id,
        userId,
        courseId: attempt.course_id,
        lessonId: attempt.lesson_id
      },
      runner
    );
  }

  return coursesRepository.upsertLessonViewProgress(
    {
      enrollmentId: attempt.enrollment_id,
      userId,
      courseId: attempt.course_id,
      lessonId: attempt.lesson_id
    },
    runner
  );
};

export const quizzesService = {
  getQuizForStudent: async ({ user, courseId, lessonId = null }) => {
    assertStudentUser(user);
    assertUuid(courseId, 'course id');

    if (lessonId) {
      assertUuid(lessonId, 'lesson id');
    }

    const { quiz, questions } = await getAccessibleQuizForStudent({
      userId: user.id,
      courseId,
      lessonId
    });

    if (quiz.total_questions < 1) {
      throw new AppError('Quiz is not available yet', 409);
    }

    return {
      quiz: sanitizeQuiz(quiz),
      questions: questions.map(sanitizeQuestion)
    };
  },

  startQuizAttempt: async ({ user, courseId, lessonId = null }) => {
    assertStudentUser(user);
    assertUuid(courseId, 'course id');

    if (lessonId) {
      assertUuid(lessonId, 'lesson id');
    }

    const { quiz, questions } = await getAccessibleQuizForStudent({
      userId: user.id,
      courseId,
      lessonId
    });

    if (quiz.total_questions < 1 || questions.length < 1) {
      throw new AppError('Quiz is not available yet', 409);
    }

    const existingAttempt = await quizzesRepository.findInProgressAttemptByUserAndQuiz({
      userId: user.id,
      quizId: quiz.id
    });

    const existingSubmittedAttempt = await quizzesRepository.findSubmittedAttemptByUserAndQuiz({
      userId: user.id,
      quizId: quiz.id
    });

    if (existingSubmittedAttempt) {
      throw new AppError('Quiz has already been submitted', 409);
    }

    if (existingAttempt) {
      return {
        quiz: sanitizeQuiz(quiz),
        attempt: sanitizeAttempt(existingAttempt),
        reusedExistingAttempt: true
      };
    }

    const client = await db.connect();
    let createdAttempt = null;

    try {
      await client.query('BEGIN');
      createdAttempt = await quizzesRepository.createAttempt(
        {
          userId: user.id,
          quizId: quiz.id
        },
        client
      );

      if (!createdAttempt) {
        const concurrentAttempt = await quizzesRepository.findInProgressAttemptByUserAndQuiz(
          {
            userId: user.id,
            quizId: quiz.id
          },
          client
        );

        if (concurrentAttempt) {
          await client.query('COMMIT');
          return {
            quiz: sanitizeQuiz(quiz),
            attempt: sanitizeAttempt(concurrentAttempt),
            reusedExistingAttempt: true
          };
        }

        const submittedAttempt = await quizzesRepository.findSubmittedAttemptByUserAndQuiz(
          {
            userId: user.id,
            quizId: quiz.id
          },
          client
        );

        if (submittedAttempt) {
          throw new AppError('Quiz has already been submitted', 409);
        }

        throw new AppError('Quiz attempt could not be started', 409);
      }

      await coursesRepository.touchEnrollmentLastAccessed(createdAttempt.enrollment_id, client);

      await activityService.logActivity({
        userId: user.id,
        activityType: ActivityTypes.QUIZ_STARTED,
        entityType: EntityTypes.QUIZ,
        entityId: quiz.id,
        metadata: {
          courseId: quiz.course_id,
          lessonId: quiz.lesson_id,
          attemptId: createdAttempt.id
        },
        runner: client
      });

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return {
      quiz: sanitizeQuiz(quiz),
      attempt: sanitizeAttempt(createdAttempt),
      reusedExistingAttempt: false
    };
  },

  submitQuizAttempt: async ({ user, attemptId, answers }) => {
    assertStudentUser(user);
    assertUuid(attemptId, 'attempt id');

    const attempt = await quizzesRepository.findAttemptByIdForUser({
      attemptId,
      userId: user.id
    });

    if (!attempt) {
      throw new AppError('Quiz attempt not found', 404);
    }

    if (attempt.status === QuizAttemptStatuses.SUBMITTED) {
      throw new AppError('Quiz attempt has already been submitted', 409);
    }

    await getAccessibleQuizForStudent({
      userId: user.id,
      courseId: attempt.course_id,
      lessonId: attempt.lesson_id
    });

    const quizPayload = await quizzesRepository.findQuizWithCorrectAnswers({
      quizId: attempt.quiz_id
    });

    if (!quizPayload) {
      throw new AppError('Quiz not found', 404);
    }

    if (quizPayload.quiz.total_questions < 1 || quizPayload.questions.length < 1) {
      throw new AppError('Quiz is not available yet', 409);
    }

    const normalizedAnswers = normalizeSubmittedAnswers(answers);
    const questionMap = buildQuestionIndex(quizPayload.questions);
    assertCompleteSubmission(normalizedAnswers, questionMap);

    const scoring = calculateScore(normalizedAnswers, questionMap);
    const passed = scoring.scorePercentage >= attempt.pass_percentage;

    const client = await db.connect();
    let submittedAttempt = null;
    let progress = null;

    try {
      await client.query('BEGIN');

      const freshAttempt = await quizzesRepository.findAttemptByIdForUser(
        {
          attemptId,
          userId: user.id
        },
        client
      );

      if (!freshAttempt) {
        throw new AppError('Quiz attempt not found', 404);
      }

      if (freshAttempt.status === QuizAttemptStatuses.SUBMITTED) {
        throw new AppError('Quiz attempt has already been submitted', 409);
      }

      const existingSubmittedAttempt = await quizzesRepository.findSubmittedAttemptByUserAndQuiz(
        {
          userId: user.id,
          quizId: freshAttempt.quiz_id
        },
        client
      );

      if (existingSubmittedAttempt && existingSubmittedAttempt.id !== attemptId) {
        throw new AppError('Quiz has already been submitted', 409);
      }

      const savedAnswers = await quizzesRepository.saveAttemptAnswers(
        {
          attemptId,
          userId: user.id,
          answers: normalizedAnswers
        },
        client
      );

      if (savedAnswers.length !== scoring.totalQuestions) {
        throw new AppError('Quiz answers could not be saved correctly', 400);
      }

      submittedAttempt = await quizzesRepository.submitAttempt(
        {
          attemptId,
          userId: user.id,
          answeredQuestions: scoring.answeredQuestions,
          correctAnswers: scoring.correctAnswers,
          scorePercentage: scoring.scorePercentage,
          passed
        },
        client
      );

      if (!submittedAttempt) {
        throw new AppError('Quiz attempt could not be submitted', 409);
      }

      await coursesRepository.touchEnrollmentLastAccessed(submittedAttempt.enrollment_id, client);

      progress = await getProgressAfterQuizSubmission(
        {
          attempt: submittedAttempt,
          userId: user.id,
          passed
        },
        client
      );

      await activityService.logActivity({
        userId: user.id,
        activityType: ActivityTypes.QUIZ_SUBMITTED,
        entityType: EntityTypes.QUIZ,
        entityId: submittedAttempt.quiz_id,
        metadata: {
          courseId: submittedAttempt.course_id,
          lessonId: submittedAttempt.lesson_id,
          attemptId: submittedAttempt.id,
          scorePercentage: submittedAttempt.score_percentage,
          passed: submittedAttempt.passed
        },
        runner: client
      });

      if (passed) {
        await activityService.logActivity({
          userId: user.id,
          activityType: ActivityTypes.QUIZ_PASSED,
          entityType: EntityTypes.QUIZ,
          entityId: submittedAttempt.quiz_id,
          metadata: {
            courseId: submittedAttempt.course_id,
            lessonId: submittedAttempt.lesson_id,
            attemptId: submittedAttempt.id,
            scorePercentage: submittedAttempt.score_percentage
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
      result: sanitizeStudentResult(submittedAttempt),
      progress: sanitizeProgress(progress)
    };
  },

  getSubmittedAttemptResult: async ({ user, attemptId }) => {
    assertStudentUser(user);
    assertUuid(attemptId, 'attempt id');

    const attempt = await quizzesRepository.findAttemptByIdForUser({
      attemptId,
      userId: user.id
    });

    if (!attempt) {
      throw new AppError('Quiz attempt not found', 404);
    }

    if (attempt.status !== QuizAttemptStatuses.SUBMITTED) {
      throw new AppError('Quiz attempt has not been submitted yet', 409);
    }

    return {
      result: sanitizeStudentResult(attempt)
    };
  }
};
