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

interface ChallengeCompletionRow {
  id: string;
  solvedAt: Date;
  pointsAwarded: number;
}

@Injectable()
export class ChallengeSubmissionQuery {
  async submitFlag(params: SubmitChallengeFlagParams) {
    const attempt = await params.tx.challengeAttempt.create({
      data: {
        challengeId: params.challengeId,
        userId: params.userId,
        submittedFlagHash: params.submittedFlagHash,
        isCorrect: params.isCorrect,
        alreadySolved: false,
      },
      select: {
        id: true,
        createdAt: true,
      },
    });

    const createdCompletions = params.isCorrect
      ? await params.tx.$queryRaw<ChallengeCompletionRow[]>`
          INSERT INTO "challenge_completions" (
            "challenge_id",
            "user_id",
            "first_correct_attempt_id",
            "points_awarded",
            "updated_at"
          )
          VALUES (
            ${params.challengeId}::uuid,
            ${params.userId}::uuid,
            ${attempt.id}::uuid,
            ${params.pointsAwarded},
            CURRENT_TIMESTAMP
          )
          ON CONFLICT ("challenge_id", "user_id") DO NOTHING
          RETURNING
            "id",
            "solved_at" AS "solvedAt",
            "points_awarded" AS "pointsAwarded"
        `
      : [];
    const createdCompletion = createdCompletions[0] ?? null;
    const existingCompletion = createdCompletion
      ? null
      : await params.tx.challengeCompletion.findUnique({
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

    if (params.isCorrect && !createdCompletion && !existingCompletion) {
      throw new Error('Authoritative challenge completion was not found after conflict');
    }

    const authoritativeCompletion = createdCompletion ?? existingCompletion;
    const alreadySolved = Boolean(authoritativeCompletion) && !createdCompletion;

    if (alreadySolved) {
      await params.tx.challengeAttempt.update({
        where: { id: attempt.id },
        data: { alreadySolved: true },
      });
    }

    return {
      attempt_id: attempt.id,
      submitted_at: attempt.createdAt,
      already_solved: alreadySolved,
      completion_id: createdCompletion?.id ?? null,
      authoritative_completion_id: authoritativeCompletion?.id ?? null,
      authoritative_completion_solved_at: authoritativeCompletion?.solvedAt ?? null,
      authoritative_completion_points_awarded: authoritativeCompletion?.pointsAwarded ?? null,
    } satisfies SubmitChallengeFlagRow;
  }
}
