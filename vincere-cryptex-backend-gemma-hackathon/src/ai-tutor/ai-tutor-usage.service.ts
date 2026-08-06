import { HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { AppConfigService } from '../config/app-config.service';
import { RedisService } from '../redis/redis.service';

export type AdmitAiTutorProviderExecution = () => Promise<void>;

@Injectable()
export class AiTutorUsageService {
  private readonly logger = new Logger(AiTutorUsageService.name);

  constructor(
    @Inject(RedisService)
    private readonly redisService: RedisService,
    @Inject(AppConfigService)
    private readonly configService: AppConfigService,
  ) {}

  async withConcurrencyProtection<T>(
    userId: string,
    operation: (admitProviderExecution: AdmitAiTutorProviderExecution) => Promise<T>,
  ): Promise<T> {
    const lockKey = this.concurrencyKey(userId);
    const ownerToken = randomUUID();
    const lockTtlSeconds = this.configService.aiTutorConcurrencyLockTtlSeconds;
    const lock = await this.redisService.acquireLock(lockKey, ownerToken, lockTtlSeconds, {
      failClosed: this.configService.isProduction,
    });

    if (!lock.acquired) {
      this.logRejection(userId, 'concurrency_limit', lock.ttlSeconds);
      throw new HttpException(
        {
          message: 'An AI Tutor request is already in progress',
          code: 'AI_TUTOR_CONCURRENCY_LIMIT',
          retryAfterSeconds: lock.ttlSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const startedAt = Date.now();
    let quotaConsumed = false;
    let admissionPromise: Promise<void> | undefined;
    const admitProviderExecution = () => {
      admissionPromise ??= this.consumeDailyQuota(userId).then(() => {
        quotaConsumed = true;
      });
      return admissionPromise;
    };

    try {
      const result = await operation(admitProviderExecution);
      if (!quotaConsumed) {
        this.logAcceptedRequest(userId, false);
      }
      this.logRequestCompleted(userId, 'success', startedAt, quotaConsumed);
      return result;
    } catch (error) {
      this.logRequestCompleted(userId, 'failure', startedAt, quotaConsumed);
      throw error;
    } finally {
      const released = await this.redisService.releaseLock(lockKey, ownerToken);
      if (!released) {
        this.logger.warn(
          JSON.stringify({
            event: 'ai_tutor.concurrency_lock.release_failed',
            timestamp: new Date().toISOString(),
            userId,
          }),
        );
      }
    }
  }

  private async consumeDailyQuota(userId: string): Promise<void> {
    const dailyQuota = this.configService.aiTutorDailyQuota;
    const result = await this.redisService.consumeDailyQuota(
      this.dailyQuotaKey(userId),
      dailyQuota,
      { failClosed: this.configService.isProduction },
    );

    if (!result.allowed) {
      this.logRejection(userId, 'daily_quota', result.ttlSeconds);
      throw new HttpException(
        {
          message: 'Daily AI Tutor request quota exceeded',
          code: 'AI_TUTOR_DAILY_QUOTA_EXCEEDED',
          retryAfterSeconds: result.ttlSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    this.logAcceptedRequest(userId, true, result.count, dailyQuota);
  }

  private logAcceptedRequest(
    userId: string,
    quotaConsumed: boolean,
    dailyUsage?: number,
    dailyQuota?: number,
  ): void {
    this.logger.log(
      JSON.stringify({
        event: 'ai_tutor.request.accepted',
        timestamp: new Date().toISOString(),
        outcome: 'accepted',
        userId,
        quotaConsumed,
        dailyUsage,
        dailyQuota,
        dailyWindow: quotaConsumed ? 'utc_calendar_day' : undefined,
      }),
    );
  }

  private logRejection(
    userId: string,
    reason: 'concurrency_limit' | 'daily_quota',
    retryAfterSeconds: number,
  ): void {
    this.logger.warn(
      JSON.stringify({
        event: 'ai_tutor.request.rejected',
        timestamp: new Date().toISOString(),
        outcome: 'blocked',
        reason,
        userId,
        retryAfterSeconds,
      }),
    );
  }

  private logRequestCompleted(
    userId: string,
    outcome: 'success' | 'failure',
    startedAt: number,
    quotaConsumed: boolean,
  ): void {
    this.logger.log(
      JSON.stringify({
        event: 'ai_tutor.request.completed',
        timestamp: new Date().toISOString(),
        outcome,
        userId,
        durationMs: Date.now() - startedAt,
        quotaConsumed,
      }),
    );
  }

  private concurrencyKey(userId: string): string {
    return `ai-tutor:usage:concurrency:${userId}`;
  }

  private dailyQuotaKey(userId: string): string {
    return `ai-tutor:usage:daily:${userId}`;
  }
}
