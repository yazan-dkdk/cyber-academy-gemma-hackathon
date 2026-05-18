import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';

import { AppConfigService } from '../config/app-config.service';
import { RedisService } from '../redis/redis.service';

export enum MfaAttemptAction {
  VERIFY = 'verify',
  DISABLE = 'disable',
}

@Injectable()
export class MfaAttemptService {
  constructor(
    @Inject(RedisService)
    private readonly redisService: RedisService,
    @Inject(AppConfigService)
    private readonly configService: AppConfigService,
  ) {}

  async assertAllowed(userId: string, action: MfaAttemptAction) {
    const lockKey = this.lockKey(userId, action);
    const lockValue = await this.redisService.raw.get(lockKey);
    if (lockValue) {
      const ttlSeconds = await this.redisService.raw.ttl(lockKey);
      throw new HttpException({
        message: 'MFA verification temporarily locked',
        retryAfterSeconds: ttlSeconds,
      }, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  async recordFailure(userId: string, action: MfaAttemptAction) {
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
  }

  async clearFailures(userId: string, action: MfaAttemptAction) {
    await this.redisService.raw.del(this.failureKey(userId, action));
    await this.redisService.raw.del(this.lockKey(userId, action));
  }

  private failureKey(userId: string, action: MfaAttemptAction) {
    return `mfa:failures:${action}:${userId}`;
  }

  private lockKey(userId: string, action: MfaAttemptAction) {
    return `mfa:lock:${action}:${userId}`;
  }
}
