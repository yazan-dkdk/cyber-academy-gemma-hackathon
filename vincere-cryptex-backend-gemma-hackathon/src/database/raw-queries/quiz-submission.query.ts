import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

interface LockQuizAttemptParams {
  tx: Prisma.TransactionClient;
  attemptId: string;
  userId: string;
}

interface SubmitQuizAttemptUpdateParams {
  tx: Prisma.TransactionClient;
  attemptId: string;
  userId: string;
  answeredQuestions: number;
  correctAnswers: number;
  scorePercentage: number;
  passed: boolean;
}

interface LockedAttemptRow {
  id: string;
  quiz_id: string;
  course_id: string;
  lesson_id: string | null;
  enrollment_id: string;
  user_id: string;
  status: 'IN_PROGRESS' | 'SUBMITTED';
  pass_percentage: number;
  total_questions: number;
}

interface SubmittedAttemptRow {
  id: string;
  quiz_id: string;
  course_id: string;
  lesson_id: string | null;
  enrollment_id: string;
  status: 'SUBMITTED';
  pass_percentage: number;
  total_questions: number;
  answered_questions: number;
  correct_answers: number;
  score_percentage: number;
  passed: boolean;
  submitted_at: Date;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class QuizSubmissionQuery {
  constructor(private readonly prisma: PrismaService) {}

  async lockAttempt(params: LockQuizAttemptParams) {
    const rows = await params.tx.$queryRaw<LockedAttemptRow[]>`
      SELECT
        qa.id,
        qa.quiz_id,
        qa.course_id,
        qa.lesson_id,
        qa.enrollment_id,
        qa.user_id,
        qa.status,
        qa.pass_percentage,
        qa.total_questions
      FROM quiz_attempts AS qa
      WHERE qa.id = ${params.attemptId}::uuid
        AND qa.user_id = ${params.userId}::uuid
      FOR UPDATE
    `;

    const attempt = rows[0];
    if (!attempt) {
      throw new NotFoundException('Quiz attempt not found');
    }

    const duplicateSubmittedAttempt = await params.tx.$queryRaw<{ id: string }[]>`
      SELECT qa.id
      FROM quiz_attempts AS qa
      WHERE qa.user_id = ${params.userId}::uuid
        AND qa.quiz_id = ${attempt.quiz_id}::uuid
        AND qa.status = 'SUBMITTED'
        AND qa.id <> ${params.attemptId}::uuid
      LIMIT 1
      FOR UPDATE
    `;

    if (duplicateSubmittedAttempt.length > 0 || attempt.status === 'SUBMITTED') {
      throw new ConflictException('Quiz has already been submitted');
    }

    return attempt;
  }

  async submitAttempt(params: SubmitQuizAttemptUpdateParams) {
    try {
      const rows = await params.tx.$queryRaw<SubmittedAttemptRow[]>`
        UPDATE quiz_attempts
        SET
          status = 'SUBMITTED',
          answered_questions = ${params.answeredQuestions},
          correct_answers = ${params.correctAnswers},
          score_percentage = ${params.scorePercentage},
          passed = ${params.passed},
          submitted_at = NOW(),
          updated_at = NOW()
        WHERE id = ${params.attemptId}::uuid
          AND user_id = ${params.userId}::uuid
          AND status = 'IN_PROGRESS'
        RETURNING
          id,
          quiz_id,
          course_id,
          lesson_id,
          enrollment_id,
          status,
          pass_percentage,
          total_questions,
          answered_questions,
          correct_answers,
          score_percentage,
          passed,
          submitted_at,
          created_at,
          updated_at
      `;

      const attempt = rows[0];
      if (!attempt) {
        throw new ConflictException('Quiz attempt could not be submitted');
      }

      return attempt;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2010'
      ) {
        throw new ConflictException('Quiz has already been submitted');
      }

      throw error;
    }
  }
}
