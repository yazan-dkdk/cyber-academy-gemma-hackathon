import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

import { AppConfigService } from '../config/app-config.service';
import { RedisService } from '../redis/redis.service';

export enum MfaAttemptAction {
  VERIFY = 'verify',
  DISABLE = 'disable',
}

@Injectable()
export class MfaAttemptService {
  private readonly logger = new Logger(MfaAttemptService.name);

  constructor(
    @Inject(RedisService)
    private readonly redisService: RedisService,
    @Inject(AppConfigService)
    private readonly configService: AppConfigService,
  ) {}

  async assertAllowed(userId: string, action: MfaAttemptAction) {
    try {
      const lockKey = this.lockKey(userId, action);
      const lockValue = await this.redisService.raw.get(lockKey);
      if (lockValue) {
        const ttlSeconds = await this.redisService.raw.ttl(lockKey);
        throw new HttpException({
          message: 'MFA verification temporarily locked',
          retryAfterSeconds: ttlSeconds,
        }, HttpStatus.TOO_MANY_REQUESTS);
      }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.throwSecurityControlsUnavailable(userId, action);
    }
  }

  async recordFailure(userId: string, action: MfaAttemptAction) {
    try {
      const { maxFailures, windowSeconds, lockSeconds } = this.configService.mfaAttemptLimit;
      const failureKey = this.failureKey(userId, action);
      const count = await this.redisService.raw.incr(failureKey);

      if (count === 1) {
        await this.redisService.raw.expire(failureKey, windowSeconds);
      }

      if (count >= maxFailures) {
        await this.redisService.raw.set(this.lockKey(userId, action), '1', {
          EX: lockSeconds,
        });
      }
    } catch {
      this.throwSecurityControlsUnavailable(userId, action);
    }
  }

  async clearFailures(userId: string, action: MfaAttemptAction) {
    try {
      await this.redisService.raw.del(this.failureKey(userId, action));
      await this.redisService.raw.del(this.lockKey(userId, action));
    } catch {
      this.throwSecurityControlsUnavailable(userId, action);
    }
  }

  private failureKey(userId: string, action: MfaAttemptAction) {
    return `mfa:failures:${action}:${userId}`;
  }

  private lockKey(userId: string, action: MfaAttemptAction) {
    return `mfa:lock:${action}:${userId}`;
  }

  private throwSecurityControlsUnavailable(userId: string, action: MfaAttemptAction): never {
    this.logger.warn(
      JSON.stringify({
        event: 'auth.mfa.security_controls_unavailable',
        timestamp: new Date().toISOString(),
        outcome: 'failed',
        reason: 'redis_unavailable',
        action,
        userId,
      }),
    );
    throw new ServiceUnavailableException('Authentication controls unavailable');
  }
}
