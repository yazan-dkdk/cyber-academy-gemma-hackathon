import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EnvironmentVariables } from './environment';

@Injectable()
export class AppConfigService {
  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  get nodeEnv() {
    return this.configService.get('NODE_ENV', { infer: true });
  }

  get isProduction() {
    return this.nodeEnv === 'production';
  }

  get port() {
    return this.configService.get('PORT', { infer: true });
  }

  get trustProxy() {
    return this.configService.get('TRUST_PROXY', { infer: true });
  }

  get appBaseUrl() {
    return this.configService.get('APP_BASE_URL', { infer: true });
  }

  get frontendOrigin() {
    return this.configService.get('FRONTEND_ORIGIN', { infer: true });
  }

  get databaseUrl() {
    return this.configService.get('DATABASE_URL', { infer: true });
  }

  get redisUrl(): string {
    return this.configService.get<string>('REDIS_URL', { infer: true });
  }

  get sessionSecret() {
    return this.configService.get('SESSION_SECRET', { infer: true });
  }

  get sessionCookieName() {
    return this.configService.get('SESSION_COOKIE_NAME', { infer: true });
  }

  get sessionTtlSeconds() {
    return this.configService.get('SESSION_TTL_SECONDS', { infer: true });
  }

  get sessionIdleTtlSeconds() {
    return this.configService.get('SESSION_IDLE_TTL_SECONDS', { infer: true });
  }

  get authStateCacheTtlSeconds() {
    return this.configService.get('AUTH_STATE_CACHE_TTL_SECONDS', { infer: true });
  }

  get mfaEncryptionKey() {
    return this.configService.get('MFA_ENCRYPTION_KEY', { infer: true });
  }

  get mfaIssuer() {
    return this.configService.get('MFA_ISSUER', { infer: true });
  }

  get passwordResetTokenTtlMinutes() {
    return this.configService.get('PASSWORD_RESET_TOKEN_TTL_MINUTES', { infer: true });
  }

  get emailVerificationTokenTtlHours() {
    return this.configService.get('EMAIL_VERIFICATION_TOKEN_TTL_HOURS', { infer: true });
  }

  get forgotPasswordMinDurationMs() {
    return this.configService.get('FORGOT_PASSWORD_MIN_DURATION_MS', { infer: true });
  }

  get labOrchestratorBaseUrl() {
    return this.configService.get('LAB_ORCHESTRATOR_BASE_URL', { infer: true });
  }

  get labOrchestratorApiKey() {
    return this.configService.get('LAB_ORCHESTRATOR_API_KEY', { infer: true });
  }

  get labOrchestratorTimeoutMs() {
    return this.configService.get('LAB_ORCHESTRATOR_TIMEOUT_MS', { infer: true });
  }

  get labProxyBaseUrl() {
    return this.configService.get('LAB_PROXY_BASE_URL', { infer: true });
  }

  get gemmaProvider() {
    return this.configService.get('GEMMA_PROVIDER', { infer: true });
  }

  get gemmaApiKey() {
    return this.configService.get('GEMMA_API_KEY', { infer: true });
  }

  get gemmaModel() {
    return this.configService.get('GEMMA_MODEL', { infer: true });
  }

  get ollamaEnabled() {
    return this.configService.get('OLLAMA_ENABLED', { infer: true });
  }

  get ollamaBaseUrl() {
    return this.configService.get('OLLAMA_BASE_URL', { infer: true });
  }

  get ollamaModel() {
    return this.configService.get('OLLAMA_MODEL', { infer: true });
  }

  get ollamaTimeoutMs() {
    return this.configService.get('OLLAMA_TIMEOUT_MS', { infer: true });
  }

  get geminiEnabled() {
    return this.configService.get('GEMINI_ENABLED', { infer: true });
  }

  get aiProviderPriority() {
    return this.configService.get('AI_PROVIDER_PRIORITY', { infer: true });
  }

  get loginRateLimit() {
    return {
      max: this.configService.get('LOGIN_RATE_LIMIT_MAX', { infer: true }),
      windowSeconds: this.configService.get('LOGIN_RATE_LIMIT_WINDOW_SECONDS', { infer: true }),
    };
  }

  get registerRateLimit() {
    return {
      max: this.configService.get('REGISTER_RATE_LIMIT_MAX', { infer: true }),
      windowSeconds: this.configService.get('REGISTER_RATE_LIMIT_WINDOW_SECONDS', {
        infer: true,
      }),
    };
  }

  get resendVerificationRateLimit() {
    return {
      max: this.configService.get('RESEND_VERIFICATION_RATE_LIMIT_MAX', { infer: true }),
      windowSeconds: this.configService.get('RESEND_VERIFICATION_RATE_LIMIT_WINDOW_SECONDS', {
        infer: true,
      }),
    };
  }

  get forgotPasswordRateLimit() {
    return {
      max: this.configService.get('FORGOT_PASSWORD_RATE_LIMIT_MAX', { infer: true }),
      windowSeconds: this.configService.get('FORGOT_PASSWORD_RATE_LIMIT_WINDOW_SECONDS', {
        infer: true,
      }),
    };
  }

  get resetPasswordRateLimit() {
    return {
      max: this.configService.get('RESET_PASSWORD_RATE_LIMIT_MAX', { infer: true }),
      windowSeconds: this.configService.get('RESET_PASSWORD_RATE_LIMIT_WINDOW_SECONDS', {
        infer: true,
      }),
    };
  }

  get flagSubmissionRateLimit() {
    return {
      max: this.configService.get('FLAG_SUBMISSION_RATE_LIMIT_MAX', { infer: true }),
      windowSeconds: this.configService.get('FLAG_SUBMISSION_RATE_LIMIT_WINDOW_SECONDS', {
        infer: true,
      }),
    };
  }

  get labStartRateLimit() {
    return {
      max: this.configService.get('LAB_START_RATE_LIMIT_MAX', { infer: true }),
      windowSeconds: this.configService.get('LAB_START_RATE_LIMIT_WINDOW_SECONDS', {
        infer: true,
      }),
    };
  }

  get labResetRateLimit() {
    return {
      max: this.configService.get('LAB_RESET_RATE_LIMIT_MAX', { infer: true }),
      windowSeconds: this.configService.get('LAB_RESET_RATE_LIMIT_WINDOW_SECONDS', {
        infer: true,
      }),
    };
  }

  get labTerminateRateLimit() {
    return {
      max: this.configService.get('LAB_TERMINATE_RATE_LIMIT_MAX', { infer: true }),
      windowSeconds: this.configService.get('LAB_TERMINATE_RATE_LIMIT_WINDOW_SECONDS', {
        infer: true,
      }),
    };
  }

  get mfaAttemptLimit() {
    return {
      maxFailures: this.configService.get('MFA_ATTEMPT_MAX_FAILURES', { infer: true }),
      windowSeconds: this.configService.get('MFA_ATTEMPT_WINDOW_SECONDS', { infer: true }),
      lockSeconds: this.configService.get('MFA_ATTEMPT_LOCK_SECONDS', { infer: true }),
    };
  }
}
