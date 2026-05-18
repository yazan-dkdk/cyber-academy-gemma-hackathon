import dotenv from 'dotenv';

dotenv.config();

const nodeEnv = process.env.NODE_ENV ?? 'development';
const appBaseUrl = process.env.APP_BASE_URL ?? 'http://localhost:3000';

const required = (value, key) => {
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
};

const parseBoolean = (value, fallback = false) => {
  if (value === undefined) {
    return fallback;
  }

  return value === 'true';
};

const parseNumber = (value, fallback) => {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Expected numeric environment variable but received: ${value}`);
  }

  return parsed;
};

export const env = {
  nodeEnv,
  port: parseNumber(process.env.PORT, 3000),
  appBaseUrl,
  databaseUrl: required(process.env.DATABASE_URL, 'DATABASE_URL'),
  redisUrl: required(process.env.REDIS_URL, 'REDIS_URL'),
  sessionSecret: required(process.env.SESSION_SECRET, 'SESSION_SECRET'),
  sessionCookieName: process.env.SESSION_COOKIE_NAME ?? 'sid',
  sessionTtlSeconds: parseNumber(process.env.SESSION_TTL_SECONDS, 60 * 60 * 24 * 7),
  sessionIdleTtlSeconds: parseNumber(process.env.SESSION_IDLE_TTL_SECONDS, 60 * 30),
  loginRateLimitMax: parseNumber(process.env.LOGIN_RATE_LIMIT_MAX, 5),
  loginRateLimitWindowSeconds: parseNumber(process.env.LOGIN_RATE_LIMIT_WINDOW_SECONDS, 60 * 15),
  registerRateLimitMax: parseNumber(process.env.REGISTER_RATE_LIMIT_MAX, 5),
  registerRateLimitWindowSeconds: parseNumber(process.env.REGISTER_RATE_LIMIT_WINDOW_SECONDS, 60 * 60),
  forgotPasswordRateLimitMax: parseNumber(process.env.FORGOT_PASSWORD_RATE_LIMIT_MAX, 5),
  forgotPasswordRateLimitWindowSeconds: parseNumber(process.env.FORGOT_PASSWORD_RATE_LIMIT_WINDOW_SECONDS, 60 * 60),
  forgotPasswordMinDurationMs: parseNumber(process.env.FORGOT_PASSWORD_MIN_DURATION_MS, 400),
  flagSubmissionRateLimitMax: parseNumber(process.env.FLAG_SUBMISSION_RATE_LIMIT_MAX, 10),
  flagSubmissionRateLimitWindowSeconds: parseNumber(process.env.FLAG_SUBMISSION_RATE_LIMIT_WINDOW_SECONDS, 60 * 5),
  labOrchestratorBaseUrl: process.env.LAB_ORCHESTRATOR_BASE_URL ?? 'http://localhost:4001/internal/labs',
  labOrchestratorApiKey: process.env.LAB_ORCHESTRATOR_API_KEY ?? '',
  labOrchestratorTimeoutMs: parseNumber(process.env.LAB_ORCHESTRATOR_TIMEOUT_MS, 10_000),
  labProxyBaseUrl: process.env.LAB_PROXY_BASE_URL ?? `${appBaseUrl}/lab-proxy`,
  mfaAttemptMaxFailures: parseNumber(process.env.MFA_ATTEMPT_MAX_FAILURES, 5),
  mfaAttemptWindowSeconds: parseNumber(process.env.MFA_ATTEMPT_WINDOW_SECONDS, 60 * 5),
  mfaAttemptLockSeconds: parseNumber(process.env.MFA_ATTEMPT_LOCK_SECONDS, 60 * 15),
  trustProxy: parseBoolean(process.env.TRUST_PROXY, false),
  isProduction: nodeEnv === 'production',
  mfaEncryptionKey: required(process.env.MFA_ENCRYPTION_KEY, 'MFA_ENCRYPTION_KEY')
};
