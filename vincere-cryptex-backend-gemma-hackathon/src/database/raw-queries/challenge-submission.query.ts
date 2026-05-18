import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

interface SubmitChallengeFlagParams {
  tx: Prisma.TransactionClient;
  challengeId: string;
  userId: string;
  submittedFlagHash: string;
  isCorrect: boolean;
  pointsAwarded: number;
}

interface SubmitChallengeFlagRow {
  attempt_id: string;
  submitted_at: Date;
  already_solved: boolean;
  completion_id: string | null;
  authoritative_completion_id: string | null;
  authoritative_completion_solved_at: Date | null;
  authoritative_completion_points_awarded: number | null;
}

@Injectable()
export class ChallengeSubmissionQuery {
  async submitFlag(params: SubmitChallengeFlagParams) {
    const existingCompletion = await params.tx.challengeCompletion.findUnique({
      where: {
        challengeId_userId: {
          challengeId: params.challengeId,
          userId: params.userId,
        },
      },
      select: {
        id: true,
        solvedAt: true,
        pointsAwarded: true,
      },
    });

    const attempt = await params.tx.challengeAttempt.create({
      data: {
        challengeId: params.challengeId,
        userId: params.userId,
        submittedFlagHash: params.submittedFlagHash,
        isCorrect: params.isCorrect,
        alreadySolved: Boolean(existingCompletion),
      },
      select: {
        id: true,
        createdAt: true,
        alreadySolved: true,
      },
    });

    const createdCompletion =
      params.isCorrect && !existingCompletion
        ? await params.tx.challengeCompletion.create({
            data: {
              challengeId: params.challengeId,
              userId: params.userId,
              firstCorrectAttemptId: attempt.id,
              pointsAwarded: params.pointsAwarded,
            },
            select: {
              id: true,
              solvedAt: true,
              pointsAwarded: true,
            },
          })
        : null;

    const authoritativeCompletion = createdCompletion ?? existingCompletion;

    return {
      attempt_id: attempt.id,
      submitted_at: attempt.createdAt,
      already_solved: attempt.alreadySolved,
      completion_id: createdCompletion?.id ?? null,
      authoritative_completion_id: authoritativeCompletion?.id ?? null,
      authoritative_completion_solved_at: authoritativeCompletion?.solvedAt ?? null,
      authoritative_completion_points_awarded: authoritativeCompletion?.pointsAwarded ?? null,
    } satisfies SubmitChallengeFlagRow;
  }
}
