import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActivityType,
  CourseStatus,
  EntityType,
  LessonStatus,
  Prisma,
  QuizAttemptStatus,
  QuizStatus,
  QuizTargetType,
  SectionStatus,
} from '@prisma/client';

import { ActivityService } from '../activity/activity.service';
import { CoursesService } from '../courses/courses.service';
import { QuizSubmissionQuery } from '../database/raw-queries/quiz-submission.query';
import { PrismaService } from '../prisma/prisma.service';

interface SubmittedAnswerInput {
  questionId: string;
  choiceId: string;
}

@Injectable()
export class QuizzesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly coursesService: CoursesService,
    private readonly activityService: ActivityService,
    private readonly quizSubmissionQuery: QuizSubmissionQuery,
  ) {}

  async getQuizForStudent(userId: string, quizId: string) {
    const quiz = await this.getAccessibleQuiz(userId, quizId);
    return {
      quiz: this.serializeQuiz(quiz),
      questions: quiz.questions.map((question) => ({
        id: question.id,
        type: question.type,
        prompt: question.prompt,
        position: question.position,
        choices: question.choices.map((choice) => ({
          id: choice.id,
          choiceText: choice.choiceText,
          position: choice.position,
        })),
      })),
    };
  }

  async startAttempt(userId: string, quizId: string) {
    const quiz = await this.getAccessibleQuiz(userId, quizId);
    if (quiz.questions.length === 0) {
      throw new ConflictException('Quiz is not available yet');
    }

    try {
      const attemptResult = await this.prisma.$transaction(async (tx) => {
        const existingSubmittedAttempt = await tx.quizAttempt.findFirst({
          where: {
            userId,
            quizId,
            status: QuizAttemptStatus.SUBMITTED,
          },
        });

        if (existingSubmittedAttempt) {
          throw new ConflictException('Quiz has already been submitted');
        }

        const existingAttempt = await tx.quizAttempt.findFirst({
          where: {
            userId,
            quizId,
            status: QuizAttemptStatus.IN_PROGRESS,
          },
        });

        if (existingAttempt) {
          return {
            attempt: existingAttempt,
            reusedExistingAttempt: true,
          };
        }

        const created = await tx.quizAttempt.create({
          data: {
            quizId: quiz.id,
            courseId: quiz.courseId,
            lessonId: quiz.lessonId,
            enrollmentId: quiz.course.enrollments[0]!.id,
            userId,
            status: QuizAttemptStatus.IN_PROGRESS,
            passPercentage: quiz.passPercentage,
            totalQuestions: quiz.questions.length,
          },
        });

        await this.coursesService.touchEnrollmentLastAccessed(quiz.course.enrollments[0]!.id, tx);
        await this.activityService.log({
          userId,
          activityType: ActivityType.QUIZ_STARTED,
          entityType: EntityType.QUIZ,
          entityId: quiz.id,
          metadata: {
            courseId: quiz.courseId,
            lessonId: quiz.lessonId,
            attemptId: created.id,
          },
          runner: tx,
        });

        return {
          attempt: created,
          reusedExistingAttempt: false,
        };
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      });

      return {
        quiz: this.serializeQuiz(quiz),
        attempt: this.serializeAttempt(attemptResult.attempt),
        reusedExistingAttempt: attemptResult.reusedExistingAttempt,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const concurrentSubmittedAttempt = await this.prisma.quizAttempt.findFirst({
          where: {
            userId,
            quizId,
            status: QuizAttemptStatus.SUBMITTED,
          },
        });

        if (concurrentSubmittedAttempt) {
          throw new ConflictException('Quiz has already been submitted');
        }

        const concurrentAttempt = await this.prisma.quizAttempt.findFirst({
          where: {
            userId,
            quizId,
            status: QuizAttemptStatus.IN_PROGRESS,
          },
        });

        if (concurrentAttempt) {
          return {
            quiz: this.serializeQuiz(quiz),
            attempt: this.serializeAttempt(concurrentAttempt),
            reusedExistingAttempt: true,
          };
        }
      }

      throw error;
    }
  }

  async submitAttempt(userId: string, attemptId: string, answers: SubmittedAnswerInput[]) {
    const attempt = await this.prisma.quizAttempt.findFirst({
      where: {
        id: attemptId,
        userId,
      },
    });

    if (!attempt) {
      throw new NotFoundException('Quiz attempt not found');
    }

    if (attempt.status === QuizAttemptStatus.SUBMITTED) {
      throw new ConflictException('Quiz attempt has already been submitted');
    }

    const quiz = await this.getAccessibleQuiz(userId, attempt.quizId);
    const answerIndex = this.buildAnswerIndex(answers);
    const questionIndex = this.buildQuestionIndex(quiz.questions);
    this.assertCompleteSubmission(answerIndex, questionIndex);

    const scoredAnswers = answers.map((answer) => {
      const question = questionIndex.get(answer.questionId)!;
      const choice = question.choices.get(answer.choiceId);
      if (!choice) {
        throw new BadRequestException('Submitted choice does not belong to the question');
      }

      return {
        questionId: answer.questionId,
        choiceId: answer.choiceId,
        selectedChoiceText: choice.choiceText,
        isCorrect: choice.isCorrect,
      };
    });

    const correctAnswers = scoredAnswers.filter((answer) => answer.isCorrect).length;
    const scorePercentage = Math.round((correctAnswers / questionIndex.size) * 100);
    const passed = scorePercentage >= attempt.passPercentage;

    const submission = await this.prisma.$transaction(async (tx) => {
      const lockedAttempt = await this.quizSubmissionQuery.lockAttempt({
        tx,
        attemptId,
        userId,
      });

      await tx.quizAttemptAnswer.deleteMany({
        where: {
          attemptId,
        },
      });

      await tx.quizAttemptAnswer.createMany({
        data: scoredAnswers.map((answer) => ({
          attemptId,
          questionId: answer.questionId,
          selectedChoiceId: answer.choiceId,
          selectedChoiceText: answer.selectedChoiceText,
          isCorrect: answer.isCorrect,
        })),
      });

      const submittedAttempt = await this.quizSubmissionQuery.submitAttempt({
        tx,
        attemptId,
        userId,
        answeredQuestions: scoredAnswers.length,
        correctAnswers,
        scorePercentage,
        passed,
      });

      await this.coursesService.touchEnrollmentLastAccessed(lockedAttempt.enrollment_id, tx);

      let progress;
      await this.activityService.log({
        userId,
        activityType: ActivityType.QUIZ_SUBMITTED,
        entityType: EntityType.QUIZ,
        entityId: lockedAttempt.quiz_id,
        metadata: {
          courseId: lockedAttempt.course_id,
          lessonId: lockedAttempt.lesson_id,
          attemptId: submittedAttempt.id,
          scorePercentage,
          passed,
        },
        runner: tx,
      });

      if (passed) {
        await this.activityService.log({
          userId,
          activityType: ActivityType.QUIZ_PASSED,
          entityType: EntityType.QUIZ,
          entityId: lockedAttempt.quiz_id,
          metadata: {
            courseId: lockedAttempt.course_id,
            lessonId: lockedAttempt.lesson_id,
            attemptId: submittedAttempt.id,
            scorePercentage,
          },
          runner: tx,
        });
      }

      if (lockedAttempt.lesson_id) {
        progress = passed
          ? await this.coursesService.completeLessonProgress(
              {
                enrollmentId: lockedAttempt.enrollment_id,
                userId,
                courseId: lockedAttempt.course_id,
                lessonId: lockedAttempt.lesson_id,
              },
              tx,
            )
          : await this.coursesService.upsertLessonViewProgress(
              {
                enrollmentId: lockedAttempt.enrollment_id,
                userId,
                courseId: lockedAttempt.course_id,
                lessonId: lockedAttempt.lesson_id,
              },
              tx,
            );

        await this.coursesService.touchEnrollmentLastAccessed(lockedAttempt.enrollment_id, tx);
        return { submittedAttempt, progress };
      }

      progress = null;

      return { submittedAttempt, progress };
    });

    return {
      result: this.serializeSubmittedResult({
        id: submission.submittedAttempt.id,
        quizId: submission.submittedAttempt.quiz_id,
        totalQuestions: submission.submittedAttempt.total_questions,
        answeredQuestions: submission.submittedAttempt.answered_questions,
        correctAnswers: submission.submittedAttempt.correct_answers,
        scorePercentage: submission.submittedAttempt.score_percentage,
        passed: submission.submittedAttempt.passed,
        submittedAt: submission.submittedAttempt.submitted_at,
      }),
      progress: submission.progress
        ? {
            startedAt: submission.progress.startedAt,
            lastViewedAt: submission.progress.lastViewedAt,
            completedAt: submission.progress.completedAt,
            isCompleted: Boolean(submission.progress.completedAt),
          }
        : null,
    };
  }

  async getSubmittedAttemptResult(userId: string, attemptId: string) {
    const attempt = await this.prisma.quizAttempt.findFirst({
      where: {
        id: attemptId,
        userId,
        status: QuizAttemptStatus.SUBMITTED,
      },
    });

    if (!attempt) {
      throw new NotFoundException('Submitted quiz attempt not found');
    }

    return {
      result: this.serializeSubmittedResult(attempt),
    };
  }

  private async getAccessibleQuiz(userId: string, quizId: string) {
    const quiz = await this.prisma.quiz.findFirst({
      where: {
        id: quizId,
        status: QuizStatus.PUBLISHED,
        publishedAt: {
          not: null,
        },
        course: {
          status: CourseStatus.PUBLISHED,
          publishedAt: {
            not: null,
          },
          enrollments: {
            some: {
              userId,
            },
          },
        },
        OR: [
          {
            targetType: QuizTargetType.COURSE,
            lessonId: null,
          },
          {
            targetType: QuizTargetType.LESSON,
            lesson: {
              status: LessonStatus.PUBLISHED,
              publishedAt: {
                not: null,
              },
              section: {
                status: SectionStatus.PUBLISHED,
                publishedAt: {
                  not: null,
                },
              },
            },
          },
        ],
      },
      include: {
        course: {
          include: {
            enrollments: {
              where: {
                userId,
              },
              take: 1,
            },
          },
        },
        questions: {
          orderBy: {
            position: 'asc',
          },
          include: {
            choices: {
              orderBy: {
                position: 'asc',
              },
            },
          },
        },
      },
    });

    if (!quiz || quiz.course.enrollments.length === 0) {
      throw new NotFoundException('Quiz not found');
    }

    return quiz;
  }

  private buildAnswerIndex(answers: SubmittedAnswerInput[]) {
    if (answers.length === 0) {
      throw new BadRequestException('Quiz answers are required');
    }

    const answerIndex = new Map<string, string>();
    for (const answer of answers) {
      if (answerIndex.has(answer.questionId)) {
        throw new BadRequestException('Each question must be answered exactly once');
      }

      answerIndex.set(answer.questionId, answer.choiceId);
    }

    return answerIndex;
  }

  private buildQuestionIndex(
    questions: Array<{
      id: string;
      choices: Array<{
        id: string;
        choiceText: string;
        isCorrect: boolean;
      }>;
    }>,
  ) {
    const index = new Map<
      string,
      {
        choices: Map<
          string,
          {
            choiceText: string;
            isCorrect: boolean;
          }
        >;
      }
    >();

    for (const question of questions) {
      const correctChoices = question.choices.filter((choice) => choice.isCorrect);
      if (correctChoices.length !== 1) {
        throw new ConflictException('Quiz is not ready for submission');
      }

      index.set(
        question.id,
        {
          choices: new Map(
            question.choices.map((choice) => [
              choice.id,
              {
                choiceText: choice.choiceText,
                isCorrect: choice.isCorrect,
              },
            ]),
          ),
        },
      );
    }

    return index;
  }

  private assertCompleteSubmission(
    answerIndex: Map<string, string>,
    questionIndex: Map<string, unknown>,
  ) {
    if (answerIndex.size !== questionIndex.size) {
      throw new BadRequestException('All quiz questions must be answered');
    }

    for (const questionId of answerIndex.keys()) {
      if (!questionIndex.has(questionId)) {
        throw new BadRequestException('Submitted answers do not match this quiz');
      }
    }
  }

  private serializeQuiz(quiz: {
    id: string;
    courseId: string;
    lessonId: string | null;
    targetType: QuizTargetType;
    title: string;
    description: string | null;
    passPercentage: number;
    publishedAt: Date | null;
    questions: Array<unknown>;
  }) {
    return {
      id: quiz.id,
      courseId: quiz.courseId,
      lessonId: quiz.lessonId,
      targetType: quiz.targetType,
      title: quiz.title,
      description: quiz.description,
      passPercentage: quiz.passPercentage,
      totalQuestions: quiz.questions.length,
      publishedAt: quiz.publishedAt,
    };
  }

  private serializeAttempt(attempt: {
    id: string;
    quizId: string;
    status: QuizAttemptStatus;
    passPercentage: number;
    totalQuestions: number;
    answeredQuestions: number;
    correctAnswers: number | null;
    scorePercentage: number | null;
    passed: boolean | null;
    startedAt: Date;
    submittedAt: Date | null;
  }) {
    return {
      id: attempt.id,
      quizId: attempt.quizId,
      status: attempt.status,
      passPercentage: attempt.passPercentage,
      totalQuestions: attempt.totalQuestions,
      answeredQuestions: attempt.answeredQuestions,
      correctAnswers: attempt.correctAnswers,
      scorePercentage: attempt.scorePercentage,
      passed: attempt.passed,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
    };
  }

  private serializeSubmittedResult(attempt: {
    id: string;
    quizId: string;
    totalQuestions: number;
    answeredQuestions: number;
    correctAnswers: number | null;
    scorePercentage: number | null;
    passed: boolean | null;
    submittedAt: Date | null;
  }) {
    return {
      attemptId: attempt.id,
      quizId: attempt.quizId,
      totalQuestions: attempt.totalQuestions,
      answeredQuestions: attempt.answeredQuestions,
      correctAnswers: attempt.correctAnswers,
      scorePercentage: attempt.scorePercentage,
      passed: attempt.passed,
      submittedAt: attempt.submittedAt,
    };
  }
}
