import { Inject, Injectable } from '@nestjs/common';
import { ActivityLog, ActivityType, EntityType, Prisma } from '@prisma/client';

import { buildPagination } from '../common/utils/pagination.util';
import { PrismaRunner } from '../common/types/prisma-runner.type';
import { PrismaService } from '../prisma/prisma.service';

interface LogActivityInput {
  userId: string;
  activityType: ActivityType;
  entityType: EntityType;
  entityId: string;
  metadata?: Record<string, unknown>;
  runner?: PrismaRunner;
}

const DEFAULT_ACTIVITY_FEED_LIMIT = 10;
const MAX_ACTIVITY_FEED_LIMIT = 10;
const ACTIVITY_FEED_LOOKAHEAD = 50;
const MEANINGFUL_ACTIVITY_TYPES: ActivityType[] = [
  ActivityType.COURSE_ENROLLED,
  ActivityType.LESSON_COMPLETED,
  ActivityType.QUIZ_SUBMITTED,
  ActivityType.CHALLENGE_ATTEMPT,
  ActivityType.CHALLENGE_SOLVED,
];

type ActivityFeedRecord = Pick<
  ActivityLog,
  'id' | 'activityType' | 'entityType' | 'entityId' | 'metadata' | 'createdAt'
>;

type ChallengeFeedContext = {
  title: string;
  slug: string;
};

@Injectable()
export class ActivityService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {}

  async log(input: LogActivityInput): Promise<ActivityLog> {
    const runner = input.runner ?? this.prisma;
    return runner.activityLog.create({
      data: {
        userId: input.userId,
        activityType: input.activityType,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  async logOnce(input: LogActivityInput): Promise<ActivityLog> {
    const runner = input.runner ?? this.prisma;
    const existing = await runner.activityLog.findFirst({
      where: {
        userId: input.userId,
        activityType: input.activityType,
        entityType: input.entityType,
        entityId: input.entityId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (existing) {
      return existing;
    }

    return this.log(input);
  }

  async listRecentActivities(
    userId: string,
    page = 1,
    pageSize = DEFAULT_ACTIVITY_FEED_LIMIT,
  ) {
    const safePageSize = this.clampFeedPageSize(pageSize);
    const where = {
      userId,
      activityType: {
        in: MEANINGFUL_ACTIVITY_TYPES,
      },
    } satisfies Prisma.ActivityLogWhereInput;
    const [total, items] = await this.prisma.$transaction([
      this.prisma.activityLog.count({
        where,
      }),
      this.prisma.activityLog.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
        skip: (page - 1) * safePageSize,
        take: ACTIVITY_FEED_LOOKAHEAD,
        select: {
          id: true,
          activityType: true,
          entityType: true,
          entityId: true,
          metadata: true,
          createdAt: true,
        },
      }),
    ]);
    const deduplicatedItems = this.deduplicateFeedItems(items).slice(0, safePageSize);

    const activities = await this.serializeFeedItems(deduplicatedItems);

    return {
      activities,
      pagination: buildPagination(page, safePageSize, total),
    };
  }

  async listStudentActivity(userId: string, page = 1, pageSize = DEFAULT_ACTIVITY_FEED_LIMIT) {
    const safePageSize = this.clampFeedPageSize(pageSize);
    const where = {
      userId,
      activityType: {
        in: MEANINGFUL_ACTIVITY_TYPES,
      },
    } satisfies Prisma.ActivityLogWhereInput;
    const [total, items] = await this.prisma.$transaction([
      this.prisma.activityLog.count({
        where,
      }),
      this.prisma.activityLog.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
        skip: (page - 1) * safePageSize,
        take: ACTIVITY_FEED_LOOKAHEAD,
        select: {
          id: true,
          activityType: true,
          entityType: true,
          entityId: true,
          metadata: true,
          createdAt: true,
        },
      }),
    ]);
    const deduplicatedItems = this.deduplicateFeedItems(items).slice(0, safePageSize);

    const activities = await this.serializeFeedItems(deduplicatedItems);

    return {
      activities,
      pagination: buildPagination(page, safePageSize, total),
    };
  }

  private toStudentActionType(activityType: ActivityType) {
    switch (activityType) {
      case ActivityType.QUIZ_STARTED:
      case ActivityType.QUIZ_SUBMITTED:
      case ActivityType.QUIZ_PASSED:
        return 'QUIZ_ATTEMPT';
      case ActivityType.CHALLENGE_HINT_USED:
        return 'HINT_USED';
      default:
        return activityType;
    }
  }

  private async serializeFeedItems(items: ActivityFeedRecord[]) {
    const challengeContext = await this.loadChallengeContext(items);

    return items.map((item) => {
      const challenge = challengeContext.get(item.entityId) ?? null;

      return {
        id: item.id,
        type: item.activityType,
        actionType: this.toStudentActionType(item.activityType),
        activityType: item.activityType,
        label: this.formatActivityLabel(item.activityType, challenge),
        description: this.formatActivityDescription(item.activityType, challenge),
        referenceType: item.entityType,
        referenceId: item.entityId,
        metadata: this.sanitizeActivityMetadata(item.metadata),
        createdAt: item.createdAt,
      };
    });
  }

  private async loadChallengeContext(items: ActivityFeedRecord[]) {
    const challengeIds = Array.from(
      new Set(
        items
          .filter((item) => item.entityType === EntityType.CHALLENGE)
          .map((item) => item.entityId),
      ),
    );

    if (!challengeIds.length) {
      return new Map<string, ChallengeFeedContext>();
    }

    const challenges = await this.prisma.challenge.findMany({
      where: {
        id: {
          in: challengeIds,
        },
      },
      select: {
        id: true,
        title: true,
        slug: true,
      },
    });

    return new Map(
      challenges.map((challenge) => [
        challenge.id,
        {
          title: challenge.title,
          slug: challenge.slug,
        },
      ]),
    );
  }

  private formatActivityLabel(
    activityType: ActivityType,
    challenge: ChallengeFeedContext | null,
  ) {
    switch (activityType) {
      case ActivityType.COURSE_ENROLLED:
        return 'Enrolled in course';
      case ActivityType.LESSON_COMPLETED:
        return 'Completed lesson';
      case ActivityType.QUIZ_SUBMITTED:
      case ActivityType.QUIZ_PASSED:
        return 'Completed quiz';
      case ActivityType.CHALLENGE_ATTEMPT:
        return this.isPhishingChallenge(challenge)
          ? 'Attempted phishing challenge'
          : 'Attempted challenge';
      case ActivityType.CHALLENGE_SOLVED:
        return this.isPhishingChallenge(challenge)
          ? 'Solved phishing challenge'
          : 'Solved challenge';
      default:
        return 'Learning activity';
    }
  }

  private formatActivityDescription(
    activityType: ActivityType,
    challenge: ChallengeFeedContext | null,
  ) {
    switch (activityType) {
      case ActivityType.COURSE_ENROLLED:
        return 'A student course enrollment was recorded by the backend.';
      case ActivityType.LESSON_COMPLETED:
        return 'A backend-tracked lesson completion was recorded.';
      case ActivityType.QUIZ_SUBMITTED:
      case ActivityType.QUIZ_PASSED:
        return 'A backend quiz attempt was completed.';
      case ActivityType.CHALLENGE_ATTEMPT:
        return this.isPhishingChallenge(challenge)
          ? 'A phishing-awareness challenge submission was recorded.'
          : 'A challenge submission was recorded.';
      case ActivityType.CHALLENGE_SOLVED:
        return this.isPhishingChallenge(challenge)
          ? 'Suspicious phishing indicators were recognized and the defensive challenge was solved.'
          : 'A backend challenge solve was recorded.';
      default:
        return 'Student learning activity recorded by the backend.';
    }
  }

  private isPhishingChallenge(challenge: ChallengeFeedContext | null) {
    if (!challenge) {
      return false;
    }

    return (
      challenge.slug === 'phishing-awareness' ||
      challenge.title.toLowerCase().includes('phishing')
    );
  }

  private sanitizeActivityMetadata(metadata: Prisma.JsonValue) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return {};
    }

    const safeMetadata: Record<string, boolean | number> = {};
    const record = metadata as Record<string, unknown>;

    if (typeof record.correct === 'boolean') {
      safeMetadata.correct = record.correct;
    }

    if (typeof record.passed === 'boolean') {
      safeMetadata.passed = record.passed;
    }

    if (typeof record.pointsAwarded === 'number' && Number.isFinite(record.pointsAwarded)) {
      safeMetadata.pointsAwarded = record.pointsAwarded;
    }

    if (typeof record.scorePercentage === 'number' && Number.isFinite(record.scorePercentage)) {
      safeMetadata.scorePercentage = record.scorePercentage;
    }

    return safeMetadata;
  }

  private clampFeedPageSize(pageSize: number) {
    return Math.min(Math.max(pageSize, 1), MAX_ACTIVITY_FEED_LIMIT);
  }

  private deduplicateFeedItems<T extends {
    activityType: ActivityType;
    entityType: EntityType;
    entityId: string;
  }>(items: T[]) {
    const seen = new Set<string>();
    const deduplicated: T[] = [];

    for (const item of items) {
      const key = `${item.activityType}:${item.entityType}:${item.entityId}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      deduplicated.push(item);
    }

    return deduplicated;
  }
}
