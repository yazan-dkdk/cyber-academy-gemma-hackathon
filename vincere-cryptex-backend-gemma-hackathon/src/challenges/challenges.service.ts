import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  ActivityType,
  ChallengeDifficulty,
  ChallengeStatus,
  EntityType,
  Prisma,
} from '@prisma/client';

import { ActivityService } from '../activity/activity.service';
import { ChallengeSubmissionQuery } from '../database/raw-queries/challenge-submission.query';
import { buildPagination } from '../common/utils/pagination.util';
import { sha256Hex, timingSafeHexComparison } from '../common/utils/crypto.util';
import { PrismaService } from '../prisma/prisma.service';
import { ListChallengesQueryDto } from './dto/list-challenges-query.dto';

type StudentChallengeStatus = 'not_started' | 'attempted' | 'solved';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class ChallengesService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(ActivityService)
    private readonly activityService: ActivityService,
    @Inject(ChallengeSubmissionQuery)
    private readonly challengeSubmissionQuery: ChallengeSubmissionQuery,
  ) {}

  async listPublishedChallenges(userId: string, query: ListChallengesQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.ChallengeWhereInput = {
      ...this.buildPublishedChallengeVisibilityWhere(),
      ...(query.search
        ? {
            OR: [
              {
                title: {
                  contains: query.search.trim(),
                  mode: 'insensitive' as const,
                },
              },
              {
                description: {
                  contains: query.search.trim(),
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
      ...(query.category ? { category: query.category.trim() } : {}),
      ...(query.difficulty ? { difficulty: query.difficulty as ChallengeDifficulty } : {}),
    };

    const [total, challenges] = await this.prisma.$transaction([
      this.prisma.challenge.count({ where }),
      this.prisma.challenge.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        include: {
          completions: {
            where: { userId },
            take: 1,
          },
          attempts: {
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          _count: {
            select: {
              attempts: {
                where: { userId },
              },
            },
          },
        },
      }),
    ]);

    return {
      challenges: challenges.map((challenge) => {
        const completion = challenge.completions[0];
        const attempt = challenge.attempts[0];
        const studentStatus = this.resolveStudentStatus(completion, attempt);

        return {
          id: challenge.id,
          slug: challenge.slug,
          title: challenge.title,
          category: challenge.category,
          difficulty: challenge.difficulty,
          points: challenge.points,
          hasDownload: Boolean(challenge.downloadStorageKey),
          studentStatus,
          attemptsCount: challenge._count.attempts,
          pointsAwarded: completion?.pointsAwarded ?? 0,
          solvedAt: completion?.solvedAt ?? null,
          publishedAt: challenge.publishedAt,
        };
      }),
      pagination: buildPagination(page, pageSize, total),
    };
  }

  async getChallengeDetails(userId: string, challengeId: string) {
    const challenge = await this.prisma.challenge.findFirst({
      where: this.buildPublishedChallengeVisibilityWhere(challengeId),
      include: {
        hints: {
          orderBy: {
            position: 'asc',
          },
          include: {
            usages: {
              where: {
                userId,
              },
              take: 1,
            },
          },
        },
        completions: {
          where: { userId },
          take: 1,
        },
        attempts: {
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        _count: {
          select: {
            attempts: {
              where: { userId },
            },
          },
        },
      },
    });

    if (!challenge || challenge.hints.length !== 2) {
      throw new NotFoundException('Challenge not found');
    }

    const completion = challenge.completions[0];
    const attempt = challenge.attempts[0];
    const studentStatus = this.resolveStudentStatus(completion, attempt);

    return {
      challenge: {
        id: challenge.id,
        slug: challenge.slug,
        title: challenge.title,
        description: challenge.description,
        category: challenge.category,
        difficulty: challenge.difficulty,
        points: challenge.points,
        studentStatus,
        attemptsCount: challenge._count.attempts,
        pointsAwarded: completion?.pointsAwarded ?? 0,
        solvedAt: completion?.solvedAt ?? null,
        publishedAt: challenge.publishedAt,
        downloadableFile: challenge.downloadStorageKey
          ? {
              name: challenge.downloadName,
              sizeBytes: challenge.downloadSizeBytes,
            }
          : null,
        hints: challenge.hints.map((hint) => ({
          id: hint.id,
          position: hint.position,
          title: hint.title,
          content: hint.usages[0] ? hint.content : null,
          isUsed: Boolean(hint.usages[0]),
          usedAt: hint.usages[0]?.usedAt ?? null,
        })),
      },
    };
  }

  async getChallengeDownload(userId: string, challengeId: string) {
    const challenge = await this.prisma.challenge.findFirst({
      where: {
        id: challengeId,
        status: ChallengeStatus.PUBLISHED,
        publishedAt: {
          not: null,
        },
        downloadStorageKey: {
          not: null,
        },
        hints: {
          some: {
            position: 1,
          },
        },
        AND: [
          {
            hints: {
              some: {
                position: 2,
              },
            },
          },
        ],
      },
      select: {
        id: true,
        downloadName: true,
        downloadSizeBytes: true,
      },
    });

    if (!challenge) {
      throw new NotFoundException('Challenge download not found');
    }

    // Authenticated student access is enforced by the controller. This codebase
    // does not currently have a safe public file-delivery helper, so the MVP
    // contract intentionally returns metadata only and never exposes raw
    // storage keys or fabricated URLs.
    return {
      download: {
        isReady: false,
        reason: 'delivery_not_configured',
        name: challenge.downloadName,
        sizeBytes: challenge.downloadSizeBytes,
      },
    };
  }

  async useHint(userId: string, challengeId: string, position: number) {
    const hint = await this.prisma.challengeHint.findFirst({
      where: {
        challengeId,
        position,
        challenge: {
          status: ChallengeStatus.PUBLISHED,
          publishedAt: {
            not: null,
          },
          hints: {
            some: {
              position: 1,
            },
          },
          AND: [
            {
              hints: {
                some: {
                  position: 2,
                },
              },
            },
          ],
        },
      },
    });

    if (!hint) {
      throw new NotFoundException('Hint not found');
    }

    const existingUsage = await this.prisma.challengeHintUsage.findUnique({
      where: {
        challengeHintId_userId: {
          challengeHintId: hint.id,
          userId,
        },
      },
    });

    if (existingUsage) {
      return {
        hint: {
          id: hint.id,
          position: hint.position,
          title: hint.title,
          content: hint.content,
          isUsed: true,
          usedAt: existingUsage.usedAt,
        },
        alreadyUsed: true,
      };
    }

    try {
      const usage = await this.prisma.$transaction(async (tx) => {
        const created = await tx.challengeHintUsage.create({
          data: {
            challengeHintId: hint.id,
            userId,
          },
        });

        await this.activityService.log({
          userId,
          activityType: ActivityType.CHALLENGE_HINT_USED,
          entityType: EntityType.CHALLENGE,
          entityId: challengeId,
          metadata: {
            hintPosition: position,
          },
          runner: tx,
        });

        return created;
      });

      return {
        hint: {
          id: hint.id,
          position: hint.position,
          title: hint.title,
          content: hint.content,
          isUsed: true,
          usedAt: usage.usedAt,
        },
        alreadyUsed: false,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const concurrentUsage = await this.prisma.challengeHintUsage.findUnique({
          where: {
            challengeHintId_userId: {
              challengeHintId: hint.id,
              userId,
            },
          },
        });

        if (concurrentUsage) {
          return {
            hint: {
              id: hint.id,
              position: hint.position,
              title: hint.title,
              content: hint.content,
              isUsed: true,
              usedAt: concurrentUsage.usedAt,
            },
            alreadyUsed: true,
          };
        }
      }

      throw error;
    }
  }

  async submitFlag(userId: string, challengeId: string, rawFlag: string) {
    const challenge = await this.prisma.challenge.findFirst({
      where: this.buildPublishedChallengeVisibilityWhere(challengeId),
      select: {
        id: true,
        points: true,
        flagHash: true,
      },
    });

    if (!challenge) {
      throw new NotFoundException('Challenge not found');
    }

    const normalizedFlag = this.normalizeFlag(rawFlag);
    const submittedFlagHash = sha256Hex(normalizedFlag);
    const isCorrect = timingSafeHexComparison(submittedFlagHash, challenge.flagHash);

    const result = await this.prisma.$transaction(async (tx) => {
      const submission = await this.challengeSubmissionQuery.submitFlag({
        tx,
        challengeId: challenge.id,
        userId,
        submittedFlagHash,
        isCorrect,
        pointsAwarded: challenge.points,
      });

      if (!submission) {
        throw new BadRequestException('Challenge submission could not be recorded');
      }

      const firstSolve = Boolean(submission.completion_id);
      const alreadySolved =
        Boolean(submission.authoritative_completion_id) && !firstSolve;
      const pointsAwarded = firstSolve
        ? submission.authoritative_completion_points_awarded ?? challenge.points
        : 0;
      const solvedAt = submission.authoritative_completion_solved_at ?? null;
      const attemptsCount = await tx.challengeAttempt.count({
        where: {
          challengeId: challenge.id,
          userId,
        },
      });

      await this.activityService.log({
        userId,
        activityType: ActivityType.CHALLENGE_ATTEMPT,
        entityType: EntityType.CHALLENGE,
        entityId: challenge.id,
        metadata: {
          attemptId: submission.attempt_id,
          correct: isCorrect,
          alreadySolved,
          pointsAwarded,
        },
        runner: tx,
      });

      if (firstSolve) {
        await this.activityService.log({
          userId,
          activityType: ActivityType.CHALLENGE_SOLVED,
          entityType: EntityType.CHALLENGE,
          entityId: challenge.id,
          metadata: {
            attemptId: submission.attempt_id,
            pointsAwarded,
          },
          runner: tx,
        });
      }

      return {
        correct: isCorrect,
        alreadySolved,
        pointsAwarded,
        attemptsCount,
        solvedAt: solvedAt ? solvedAt.toISOString() : null,
        message: this.buildSubmissionMessage(isCorrect, alreadySolved, pointsAwarded),
      };
    });

    return result;
  }

  private normalizeFlag(flag: string) {
    const normalizedFlag = flag.replace(/^ +| +$/g, '');
    if (!normalizedFlag) {
      throw new BadRequestException('Flag is required');
    }

    return normalizedFlag;
  }

  private buildPublishedChallengeVisibilityWhere(challengeId?: string): Prisma.ChallengeWhereInput {
    const challengeIdentifierWhere: Prisma.ChallengeWhereInput | undefined = challengeId
      ? UUID_PATTERN.test(challengeId)
        ? {
            OR: [{ id: challengeId }, { slug: challengeId }],
          }
        : {
            slug: challengeId,
          }
      : undefined;

    return {
      ...challengeIdentifierWhere,
      status: ChallengeStatus.PUBLISHED,
      publishedAt: {
        not: null,
      },
      hints: {
        some: {
          position: 1,
        },
      },
      AND: [
        {
          hints: {
            some: {
              position: 2,
            },
          },
        },
      ],
    };
  }

  private buildSubmissionMessage(
    correct: boolean,
    alreadySolved: boolean,
    pointsAwarded: number,
  ) {
    if (alreadySolved) {
      return 'Challenge already solved; submission recorded.';
    }

    if (correct) {
      return `Correct flag. ${pointsAwarded} points awarded.`;
    }

    return 'Incorrect flag. Try again.';
  }

  private resolveStudentStatus(
    completion:
      | {
          id: string;
        }
      | undefined,
    attempt:
      | {
          id: string;
        }
      | undefined,
  ): StudentChallengeStatus {
    if (completion) {
      return 'solved';
    }

    if (attempt) {
      return 'attempted';
    }

    return 'not_started';
  }
}
