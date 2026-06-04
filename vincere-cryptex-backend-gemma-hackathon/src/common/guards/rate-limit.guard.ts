import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { sha256Hex } from '../utils/crypto.util';
import { AppConfigService } from '../../config/app-config.service';
import { RedisService } from '../../redis/redis.service';
import { RATE_LIMIT_PRESET_KEY, RateLimitPreset } from '../decorators/rate-limit.decorator';
import { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    @Inject(Reflector)
    private readonly reflector: Reflector,
    @Inject(RedisService)
    private readonly redisService: RedisService,
    @Inject(AppConfigService)
    private readonly configService: AppConfigService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const preset = this.reflector?.getAllAndOverride<RateLimitPreset | undefined>(
      RATE_LIMIT_PRESET_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!preset) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const { key, max, windowSeconds } = this.buildRateLimitContext(preset, request);
    const authSensitive = this.isAuthSensitivePreset(preset);
    const { count, ttlSeconds } = await this.redisService.incrementRateLimit(key, windowSeconds, {
      failClosed: authSensitive,
    });

    if (count > max) {
      this.logRateLimitTriggered(preset, request, ttlSeconds);
      throw new HttpException({
        message: 'Too many requests',
        retryAfterSeconds: ttlSeconds,
      }, HttpStatus.TOO_MANY_REQUESTS);
    }

    return true;
  }

  private logRateLimitTriggered(
    preset: RateLimitPreset,
    request: AuthenticatedRequest,
    retryAfterSeconds: number,
  ) {
    this.logger.warn(
      JSON.stringify({
        event: 'auth.rate_limit.triggered',
        timestamp: new Date().toISOString(),
        outcome: 'blocked',
        reason: 'rate_limit_exceeded',
        action: preset,
        route: request.url,
        userId: request.auth?.user.id,
        emailHash: this.getRequestEmailHash(request),
        retryAfterSeconds,
      }),
    );
  }

  private getRequestEmailHash(request: AuthenticatedRequest) {
    const email =
      typeof request.body === 'object' && request.body && 'email' in request.body
        ? String((request.body as Record<string, unknown>).email).trim().toLowerCase()
        : '';

    return email ? sha256Hex(email) : undefined;
  }

  private isAuthSensitivePreset(preset: RateLimitPreset) {
    return (
      preset === RateLimitPreset.LOGIN ||
      preset === RateLimitPreset.REGISTER ||
      preset === RateLimitPreset.RESEND_VERIFICATION ||
      preset === RateLimitPreset.FORGOT_PASSWORD ||
      preset === RateLimitPreset.RESET_PASSWORD ||
      preset === RateLimitPreset.MFA_VERIFY
    );
  }

  private buildRateLimitContext(preset: RateLimitPreset, request: AuthenticatedRequest) {
    const ip = request.ip ?? 'unknown';
    const email =
      typeof request.body === 'object' && request.body && 'email' in request.body
        ? String((request.body as Record<string, unknown>).email).trim().toLowerCase()
        : 'anonymous';
    const userId = request.auth?.user.id ?? 'anonymous';
    const labId =
      typeof request.params === 'object' && request.params && 'labId' in request.params
        ? String((request.params as Record<string, unknown>).labId)
        : 'unknown';
    const resetTokenFingerprint =
      typeof request.body === 'object' && request.body && 'token' in request.body
        ? sha256Hex(String((request.body as Record<string, unknown>).token).trim().toLowerCase())
        : 'missing';

    if (preset === RateLimitPreset.LOGIN) {
      const limit = this.configService.loginRateLimit;
      return {
        key: `rate-limit:login:${ip}:${email}`,
        max: limit.max,
        windowSeconds: limit.windowSeconds,
      };
    }

    if (preset === RateLimitPreset.REGISTER) {
      const limit = this.configService.registerRateLimit;
      return {
        key: `rate-limit:register:${ip}:${email}`,
        max: limit.max,
        windowSeconds: limit.windowSeconds,
      };
    }

    if (preset === RateLimitPreset.RESEND_VERIFICATION) {
      const limit = this.configService.resendVerificationRateLimit;
      return {
        key: `rate-limit:resend-verification:${ip}:${email}`,
        max: limit.max,
        windowSeconds: limit.windowSeconds,
      };
    }

    if (preset === RateLimitPreset.FORGOT_PASSWORD) {
      const limit = this.configService.forgotPasswordRateLimit;
      return {
        key: `rate-limit:forgot-password:${ip}:${email}`,
        max: limit.max,
        windowSeconds: limit.windowSeconds,
      };
    }

    if (preset === RateLimitPreset.RESET_PASSWORD) {
      const limit = this.configService.resetPasswordRateLimit;
      return {
        key: `rate-limit:reset-password:${ip}:${resetTokenFingerprint}`,
        max: limit.max,
        windowSeconds: limit.windowSeconds,
      };
    }

    if (preset === RateLimitPreset.MFA_VERIFY) {
      const limit = this.configService.mfaAttemptLimit;
      return {
        key: `rate-limit:mfa:${userId}:${ip}`,
        max: limit.maxFailures,
        windowSeconds: limit.windowSeconds,
      };
    }

    if (preset === RateLimitPreset.LAB_START) {
      const limit = this.configService.labStartRateLimit;
      return {
        key: `rate-limit:lab:start:${userId}:${labId}:${ip}`,
        max: limit.max,
        windowSeconds: limit.windowSeconds,
      };
    }

    if (preset === RateLimitPreset.LAB_RESET) {
      const limit = this.configService.labResetRateLimit;
      return {
        key: `rate-limit:lab:reset:${userId}:${labId}:${ip}`,
        max: limit.max,
        windowSeconds: limit.windowSeconds,
      };
    }

    if (preset === RateLimitPreset.LAB_TERMINATE) {
      const limit = this.configService.labTerminateRateLimit;
      return {
        key: `rate-limit:lab:terminate:${userId}:${labId}:${ip}`,
        max: limit.max,
        windowSeconds: limit.windowSeconds,
      };
    }

    const limit = this.configService.flagSubmissionRateLimit;
    return {
      key: `rate-limit:flag:${userId}:${ip}`,
      max: limit.max,
      windowSeconds: limit.windowSeconds,
    };
  }
}
