const REQUIRED_ENVIRONMENT_VARIABLES = [
  'APP_BASE_URL',
  'DATABASE_URL',
  'REDIS_URL',
  'SESSION_SECRET',
  'SESSION_COOKIE_NAME',
  'MFA_ENCRYPTION_KEY',
  'LAB_ORCHESTRATOR_BASE_URL',
  'LAB_ORCHESTRATOR_API_KEY',
  'LAB_PROXY_BASE_URL',
] as const;

const EXAMPLE_SECRET_VALUES = new Set([
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
]);

const PLACEHOLDER_VALUE_TOKENS = new Set([
  'changeme',
  'demo',
  'dummy',
  'example',
  'fake',
  'placeholder',
  'replace',
  'sample',
  'your',
]);

const parseBoolean = (value: unknown, fallback = false): boolean => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (value === 'true' || value === true) {
    return true;
  }

  if (value === 'false' || value === false) {
    return false;
  }

  throw new Error(`Expected a boolean value but received "${String(value)}"`);
};

const parseNodeEnv = (value: unknown): EnvironmentVariables['NODE_ENV'] => {
  const nodeEnv = String(value ?? 'development');
  if (nodeEnv !== 'development' && nodeEnv !== 'test' && nodeEnv !== 'production') {
    throw new Error('NODE_ENV must be one of development, test, or production');
  }

  return nodeEnv;
};

const parseEmailProvider = (value: unknown): EnvironmentVariables['EMAIL_PROVIDER'] => {
  const provider = String(value ?? 'smtp').trim().toLowerCase();
  if (provider !== 'smtp' && provider !== 'resend') {
    throw new Error('EMAIL_PROVIDER must be either "smtp" or "resend"');
  }

  return provider;
};

const parseInteger = (value: unknown, fieldName: string, fallback?: number): number => {
  if ((value === undefined || value === null || value === '') && fallback !== undefined) {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${fieldName} must be an integer`);
  }

  return parsed;
};

const parseOptionalInteger = (value: unknown, fieldName: string): number | null => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return parseInteger(value, fieldName);
};

const trimOptional = (value: unknown): string => {
  return typeof value === 'string' ? value.trim() : '';
};

const normalizeUrl = (value: string) => value.replace(/\/+$/, '');

const parseUrl = (value: string, fieldName: string): URL => {
  try {
    return new URL(value);
  } catch {
    throw new Error(`${fieldName} must be a valid URL`);
  }
};

const assertUrl = (value: string, fieldName: string) => {
  parseUrl(value, fieldName);
};

const isLoopbackHostname = (hostname: string): boolean => {
  const normalized = hostname.toLowerCase().replace(/^\[(.*)\]$/, '$1');

  return (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized === '0.0.0.0' ||
    normalized === '::' ||
    normalized === '::1' ||
    /^127(?:\.\d{1,3}){3}$/.test(normalized)
  );
};

const assertProductionOrigin = (value: string, fieldName: string): URL => {
  if (value !== value.trim()) {
    throw new Error(`${fieldName} must not contain leading or trailing whitespace`);
  }

  const parsed = parseUrl(value, fieldName);

  if (parsed.protocol !== 'https:') {
    throw new Error(`${fieldName} must use https:// in production`);
  }

  if (parsed.username || parsed.password) {
    throw new Error(`${fieldName} must not contain credentials`);
  }

  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error(`${fieldName} must be an origin without a path, query, or fragment`);
  }

  if (isLoopbackHostname(parsed.hostname)) {
    throw new Error(`${fieldName} must not use a loopback host in production`);
  }

  return parsed;
};

const assertHttpBaseUrl = (value: string, fieldName: string) => {
  if (value !== value.trim()) {
    throw new Error(`${fieldName} must not contain leading or trailing whitespace`);
  }

  const parsed = parseUrl(value, fieldName);

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${fieldName} must use the http:// or https:// protocol`);
  }

  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(`${fieldName} must not contain credentials, a query, or a fragment`);
  }
};

const isPlaceholderValue = (value: string): boolean => {
  const normalized = value.trim().toLowerCase();

  if (EXAMPLE_SECRET_VALUES.has(normalized)) {
    return true;
  }

  const tokens = normalized.split(/[^a-z0-9]+/).filter(Boolean);
  const collapsed = tokens.join('');

  return (
    tokens.some((token) => PLACEHOLDER_VALUE_TOKENS.has(token)) ||
    /^(?:dev)?(?:demo|dummy|example|fake|placeholder|sample)/.test(collapsed) ||
    collapsed.includes('changeme') ||
    collapsed.includes('replaceme')
  );
};

const assertProductionSecret = (
  value: unknown,
  fieldName: string,
  minimumLength?: number,
): string => {
  const secret = trimOptional(value);

  if (!secret) {
    throw new Error(`${fieldName} is required in production`);
  }

  if (isPlaceholderValue(secret)) {
    throw new Error(`${fieldName} must not use an example, demo, or placeholder secret`);
  }

  if (minimumLength !== undefined && secret.length < minimumLength) {
    throw new Error(`${fieldName} must be at least ${minimumLength} characters in production`);
  }

  return secret;
};

const assertNotPlaceholderValue = (value: string, fieldName: string) => {
  if (isPlaceholderValue(value)) {
    throw new Error(`${fieldName} must not use an example, demo, or placeholder value`);
  }
};

const assertCookieDomain = (value: string, origins: URL[]) => {
  if (!value) {
    return;
  }

  const domain = value.replace(/^\./, '').toLowerCase();
  const domainLabels = domain.split('.');
  const isValidDomain =
    domain.length <= 253 &&
    domainLabels.every(
      (label) =>
        label.length > 0 &&
        label.length <= 63 &&
        /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
    );

  if (!isValidDomain || /^\d+(?:\.\d+){3}$/.test(domain) || isLoopbackHostname(domain)) {
    throw new Error('COOKIE_DOMAIN must be a valid non-loopback domain in production');
  }

  const matchesEveryOrigin = origins.every(
    (origin) => origin.hostname === domain || origin.hostname.endsWith(`.${domain}`),
  );

  if (!matchesEveryOrigin) {
    throw new Error('COOKIE_DOMAIN must match both backend and frontend origins');
  }
};

const assertPostgresUrl = (value: string, fieldName: string) => {
  assertUrl(value, fieldName);
  const parsed = new URL(value);
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error(`${fieldName} must use the postgresql:// or postgres:// protocol`);
  }
};

const assertRedisUrl = (value: string, fieldName: string) => {
  if (value !== value.trim()) {
    throw new Error(`${fieldName} must not contain leading or trailing whitespace`);
  }

  const parsed = parseUrl(value, fieldName);
  if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') {
    throw new Error(`${fieldName} must use the redis:// or rediss:// protocol`);
  }

  if (!parsed.hostname) {
    throw new Error(`${fieldName} must include a hostname`);
  }

  if (parsed.search || parsed.hash) {
    throw new Error(`${fieldName} must not contain a query or fragment`);
  }

  const databaseNumber = parsed.pathname.replace(/^\//, '');
  if (databaseNumber && !/^\d+$/.test(databaseNumber)) {
    throw new Error(`${fieldName} database path must be a non-negative integer`);
  }

  if (parsed.password) {
    let password: string;

    try {
      password = decodeURIComponent(parsed.password);
    } catch {
      throw new Error(`${fieldName} contains invalid password encoding`);
    }

    assertProductionSecret(password, `${fieldName} password`);
  }
};

export interface EnvironmentVariables {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  TRUST_PROXY: boolean;
  APP_BASE_URL: string;
  FRONTEND_ORIGIN: string;
  FRONTEND_URL: string;
  DATABASE_URL: string;
  REDIS_URL: string;
  SESSION_SECRET: string;
  SESSION_COOKIE_NAME: string;
  COOKIE_SECURE: boolean;
  COOKIE_DOMAIN: string | null;
  SESSION_TTL_SECONDS: number;
  SESSION_IDLE_TTL_SECONDS: number;
  AUTH_STATE_CACHE_TTL_SECONDS: number;
  MFA_ENCRYPTION_KEY: string;
  MFA_ISSUER: string;
  PASSWORD_RESET_TOKEN_TTL_MINUTES: number;
  EMAIL_VERIFICATION_TOKEN_TTL_HOURS: number;
  LOGIN_RATE_LIMIT_MAX: number;
  LOGIN_RATE_LIMIT_WINDOW_SECONDS: number;
  REGISTER_RATE_LIMIT_MAX: number;
  REGISTER_RATE_LIMIT_WINDOW_SECONDS: number;
  RESEND_VERIFICATION_RATE_LIMIT_MAX: number;
  RESEND_VERIFICATION_RATE_LIMIT_WINDOW_SECONDS: number;
  FORGOT_PASSWORD_RATE_LIMIT_MAX: number;
  FORGOT_PASSWORD_RATE_LIMIT_WINDOW_SECONDS: number;
  RESET_PASSWORD_RATE_LIMIT_MAX: number;
  RESET_PASSWORD_RATE_LIMIT_WINDOW_SECONDS: number;
  FORGOT_PASSWORD_MIN_DURATION_MS: number;
  FLAG_SUBMISSION_RATE_LIMIT_MAX: number;
  FLAG_SUBMISSION_RATE_LIMIT_WINDOW_SECONDS: number;
  LAB_START_RATE_LIMIT_MAX: number;
  LAB_START_RATE_LIMIT_WINDOW_SECONDS: number;
  LAB_RESET_RATE_LIMIT_MAX: number;
  LAB_RESET_RATE_LIMIT_WINDOW_SECONDS: number;
  LAB_TERMINATE_RATE_LIMIT_MAX: number;
  LAB_TERMINATE_RATE_LIMIT_WINDOW_SECONDS: number;
  EMAIL_PROVIDER: 'smtp' | 'resend';
  RESEND_API_KEY: string;
  MAIL_FROM: string;
  APP_NAME: string;
  MAIL_HOST: string;
  MAIL_PORT: number | null;
  MAIL_USER: string;
  MAIL_PASS: string;
  MFA_ATTEMPT_MAX_FAILURES: number;
  MFA_ATTEMPT_WINDOW_SECONDS: number;
  MFA_ATTEMPT_LOCK_SECONDS: number;
  LAB_ORCHESTRATOR_BASE_URL: string;
  LAB_ORCHESTRATOR_API_KEY: string;
  LAB_ORCHESTRATOR_TIMEOUT_MS: number;
  LAB_PROXY_BASE_URL: string;
  GEMMA_PROVIDER: string;
  GEMMA_API_KEY: string;
  GEMMA_MODEL: string;
  OLLAMA_ENABLED: boolean;
  OLLAMA_BASE_URL: string;
  OLLAMA_MODEL: string;
  OLLAMA_TIMEOUT_MS: number;
  GEMINI_ENABLED: boolean;
  AI_PROVIDER_PRIORITY: string;
}

export const validateEnvironment = (
  config: Record<string, unknown>,
): EnvironmentVariables => {
  for (const variableName of REQUIRED_ENVIRONMENT_VARIABLES) {
    if (!config[variableName]) {
      throw new Error(`Missing required environment variable ${variableName}`);
    }
  }

  const mfaEncryptionKey = String(config.MFA_ENCRYPTION_KEY);
  if (!/^[0-9a-fA-F]{64}$/.test(mfaEncryptionKey)) {
    throw new Error('MFA_ENCRYPTION_KEY must be a 64-character hexadecimal string');
  }

  const authStateCacheTtlSeconds = parseInteger(
    config.AUTH_STATE_CACHE_TTL_SECONDS,
    'AUTH_STATE_CACHE_TTL_SECONDS',
    90,
  );
  if (authStateCacheTtlSeconds < 1 || authStateCacheTtlSeconds > 120) {
    throw new Error('AUTH_STATE_CACHE_TTL_SECONDS must be between 1 and 120');
  }

  const nodeEnv = parseNodeEnv(config.NODE_ENV);
  const isProduction = nodeEnv === 'production';
  const appBaseUrl = normalizeUrl(String(config.APP_BASE_URL));
  const frontendOrigin = normalizeUrl(String(config.FRONTEND_ORIGIN ?? config.APP_BASE_URL));
  const frontendUrl = normalizeUrl(String(config.FRONTEND_URL ?? frontendOrigin));
  const databaseUrl = String(config.DATABASE_URL);
  const redisUrl = String(config.REDIS_URL);
  const sessionSecret = String(config.SESSION_SECRET);
  const sessionCookieName = String(config.SESSION_COOKIE_NAME);
  const cookieSecure = parseBoolean(config.COOKIE_SECURE, isProduction);
  const cookieDomain = trimOptional(config.COOKIE_DOMAIN);
  const emailProvider = parseEmailProvider(config.EMAIL_PROVIDER);
  const resendApiKey = trimOptional(config.RESEND_API_KEY);
  const explicitMailFrom = trimOptional(config.MAIL_FROM);
  const mailHost = trimOptional(config.MAIL_HOST);
  const mailPort = parseOptionalInteger(config.MAIL_PORT, 'MAIL_PORT');
  const mailUser = trimOptional(config.MAIL_USER);
  const mailPass = String(config.MAIL_PASS ?? '');
  const gemmaProvider = String(config.GEMMA_PROVIDER ?? 'mock') || 'mock';
  const gemmaApiKey = String(config.GEMMA_API_KEY ?? '');
  const gemmaModel = String(config.GEMMA_MODEL ?? '');
  const ollamaEnabled = parseBoolean(config.OLLAMA_ENABLED, true);
  const ollamaBaseUrl = String(config.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434');
  const ollamaModel = String(config.OLLAMA_MODEL ?? 'gemma-local');
  const ollamaTimeoutMs = parseInteger(config.OLLAMA_TIMEOUT_MS, 'OLLAMA_TIMEOUT_MS', 60000);
  const geminiEnabled = parseBoolean(
    config.GEMINI_ENABLED,
    gemmaProvider.trim().toLowerCase() === 'google',
  );
  const aiProviderPriority = String(config.AI_PROVIDER_PRIORITY ?? 'local-first');

  assertUrl(appBaseUrl, 'APP_BASE_URL');
  assertUrl(frontendOrigin, 'FRONTEND_ORIGIN');
  assertUrl(frontendUrl, 'FRONTEND_URL');

  if (isProduction) {
    if (!config.FRONTEND_URL) {
      throw new Error('FRONTEND_URL is required in production');
    }

    if (!config.FRONTEND_ORIGIN) {
      throw new Error('FRONTEND_ORIGIN is required in production');
    }

    const backendOrigin = assertProductionOrigin(appBaseUrl, 'APP_BASE_URL');
    const allowedFrontendOrigin = assertProductionOrigin(frontendOrigin, 'FRONTEND_ORIGIN');
    const publicFrontendOrigin = assertProductionOrigin(frontendUrl, 'FRONTEND_URL');

    if (allowedFrontendOrigin.origin !== publicFrontendOrigin.origin) {
      throw new Error('FRONTEND_URL and FRONTEND_ORIGIN must use the same origin');
    }

    assertPostgresUrl(databaseUrl, 'DATABASE_URL');
    assertRedisUrl(redisUrl, 'REDIS_URL');

    assertProductionSecret(sessionSecret, 'SESSION_SECRET', 32);
    assertProductionSecret(mfaEncryptionKey, 'MFA_ENCRYPTION_KEY');
    assertProductionSecret(config.LAB_ORCHESTRATOR_API_KEY, 'LAB_ORCHESTRATOR_API_KEY', 32);

    if (
      config.COOKIE_SECURE === undefined ||
      config.COOKIE_SECURE === null ||
      config.COOKIE_SECURE === ''
    ) {
      throw new Error('COOKIE_SECURE must be explicitly set to true in production');
    }

    if (!cookieSecure) {
      throw new Error('COOKIE_SECURE must be true in production');
    }

    if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(sessionCookieName)) {
      throw new Error('SESSION_COOKIE_NAME must be a valid cookie name');
    }

    assertCookieDomain(cookieDomain, [backendOrigin, allowedFrontendOrigin]);

    if (!explicitMailFrom) {
      throw new Error('MAIL_FROM is required in production');
    }

    if (!trimOptional(config.EMAIL_PROVIDER)) {
      throw new Error('EMAIL_PROVIDER is required in production');
    }

    if (emailProvider === 'resend' && !resendApiKey) {
      throw new Error('RESEND_API_KEY is required when EMAIL_PROVIDER=resend');
    }

    if (emailProvider === 'resend') {
      assertProductionSecret(resendApiKey, 'RESEND_API_KEY', 20);
    }

    if (
      emailProvider === 'smtp' &&
      (!mailHost || !mailPort || mailPort <= 0 || !mailUser || !trimOptional(mailPass))
    ) {
      throw new Error(
        'MAIL_HOST, MAIL_PORT, MAIL_USER, and MAIL_PASS are required when EMAIL_PROVIDER=smtp in production',
      );
    }

    if (emailProvider === 'smtp') {
      assertProductionSecret(mailPass, 'MAIL_PASS');
    }

    if (!trimOptional(config.GEMMA_PROVIDER)) {
      throw new Error('GEMMA_PROVIDER is required in production');
    }

    if (
      config.OLLAMA_ENABLED === undefined ||
      config.OLLAMA_ENABLED === null ||
      config.OLLAMA_ENABLED === ''
    ) {
      throw new Error('OLLAMA_ENABLED must be explicitly configured in production');
    }

    if (
      config.GEMINI_ENABLED === undefined ||
      config.GEMINI_ENABLED === null ||
      config.GEMINI_ENABLED === ''
    ) {
      throw new Error('GEMINI_ENABLED must be explicitly configured in production');
    }

    if (!trimOptional(config.AI_PROVIDER_PRIORITY)) {
      throw new Error('AI_PROVIDER_PRIORITY is required in production');
    }

    const normalizedGemmaProvider = gemmaProvider.trim().toLowerCase();
    const normalizedProviderPriority = aiProviderPriority.trim().toLowerCase();

    if (normalizedGemmaProvider !== 'ollama' && normalizedGemmaProvider !== 'google') {
      throw new Error('GEMMA_PROVIDER must be either "ollama" or "google" in production');
    }

    if (normalizedProviderPriority !== 'local-first') {
      throw new Error('AI_PROVIDER_PRIORITY must be "local-first"');
    }

    if (!ollamaEnabled && !geminiEnabled) {
      throw new Error('At least one AI provider must be enabled in production');
    }

    if (normalizedGemmaProvider === 'ollama' && !ollamaEnabled) {
      throw new Error('OLLAMA_ENABLED must be true when GEMMA_PROVIDER=ollama');
    }

    if (normalizedGemmaProvider === 'google' && !geminiEnabled) {
      throw new Error('GEMINI_ENABLED must be true when GEMMA_PROVIDER=google');
    }

    if (ollamaEnabled) {
      if (!trimOptional(config.OLLAMA_BASE_URL)) {
        throw new Error('OLLAMA_BASE_URL is required when Ollama is enabled in production');
      }

      if (!trimOptional(config.OLLAMA_MODEL)) {
        throw new Error('OLLAMA_MODEL is required when Ollama is enabled in production');
      }

      if (
        config.OLLAMA_TIMEOUT_MS === undefined ||
        config.OLLAMA_TIMEOUT_MS === null ||
        config.OLLAMA_TIMEOUT_MS === ''
      ) {
        throw new Error('OLLAMA_TIMEOUT_MS is required when Ollama is enabled in production');
      }

      assertHttpBaseUrl(ollamaBaseUrl, 'OLLAMA_BASE_URL');
      assertNotPlaceholderValue(ollamaModel, 'OLLAMA_MODEL');

      if (ollamaTimeoutMs <= 0) {
        throw new Error('OLLAMA_TIMEOUT_MS must be greater than zero');
      }
    }

    if (geminiEnabled) {
      assertProductionSecret(gemmaApiKey, 'GEMMA_API_KEY', 20);

      const configuredGemmaModel = trimOptional(gemmaModel);
      if (!configuredGemmaModel) {
        throw new Error('GEMMA_MODEL is required when Gemini is enabled in production');
      }

      assertNotPlaceholderValue(configuredGemmaModel, 'GEMMA_MODEL');
    }
  }

  return {
    NODE_ENV: nodeEnv,
    PORT: parseInteger(config.PORT, 'PORT', 3000),
    TRUST_PROXY: parseBoolean(config.TRUST_PROXY, false),
    APP_BASE_URL: appBaseUrl,
    FRONTEND_ORIGIN: frontendOrigin,
    FRONTEND_URL: frontendUrl,
    DATABASE_URL: databaseUrl,
    REDIS_URL: redisUrl,
    SESSION_SECRET: sessionSecret,
    SESSION_COOKIE_NAME: sessionCookieName,
    COOKIE_SECURE: cookieSecure,
    COOKIE_DOMAIN: cookieDomain || null,
    SESSION_TTL_SECONDS: parseInteger(config.SESSION_TTL_SECONDS, 'SESSION_TTL_SECONDS', 604800),
    SESSION_IDLE_TTL_SECONDS: parseInteger(
      config.SESSION_IDLE_TTL_SECONDS,
      'SESSION_IDLE_TTL_SECONDS',
      1800,
    ),
    AUTH_STATE_CACHE_TTL_SECONDS: authStateCacheTtlSeconds,
    MFA_ENCRYPTION_KEY: mfaEncryptionKey,
    MFA_ISSUER: String(config.MFA_ISSUER ?? 'Cyber Academy Web'),
    PASSWORD_RESET_TOKEN_TTL_MINUTES: parseInteger(
      config.PASSWORD_RESET_TOKEN_TTL_MINUTES,
      'PASSWORD_RESET_TOKEN_TTL_MINUTES',
      15,
    ),
    EMAIL_VERIFICATION_TOKEN_TTL_HOURS: parseInteger(
      config.EMAIL_VERIFICATION_TOKEN_TTL_HOURS,
      'EMAIL_VERIFICATION_TOKEN_TTL_HOURS',
      24,
    ),
    LOGIN_RATE_LIMIT_MAX: parseInteger(config.LOGIN_RATE_LIMIT_MAX, 'LOGIN_RATE_LIMIT_MAX', 5),
    LOGIN_RATE_LIMIT_WINDOW_SECONDS: parseInteger(
      config.LOGIN_RATE_LIMIT_WINDOW_SECONDS,
      'LOGIN_RATE_LIMIT_WINDOW_SECONDS',
      900,
    ),
    REGISTER_RATE_LIMIT_MAX: parseInteger(
      config.REGISTER_RATE_LIMIT_MAX,
      'REGISTER_RATE_LIMIT_MAX',
      5,
    ),
    REGISTER_RATE_LIMIT_WINDOW_SECONDS: parseInteger(
      config.REGISTER_RATE_LIMIT_WINDOW_SECONDS,
      'REGISTER_RATE_LIMIT_WINDOW_SECONDS',
      3600,
    ),
    RESEND_VERIFICATION_RATE_LIMIT_MAX: parseInteger(
      config.RESEND_VERIFICATION_RATE_LIMIT_MAX,
      'RESEND_VERIFICATION_RATE_LIMIT_MAX',
      5,
    ),
    RESEND_VERIFICATION_RATE_LIMIT_WINDOW_SECONDS: parseInteger(
      config.RESEND_VERIFICATION_RATE_LIMIT_WINDOW_SECONDS,
      'RESEND_VERIFICATION_RATE_LIMIT_WINDOW_SECONDS',
      3600,
    ),
    FORGOT_PASSWORD_RATE_LIMIT_MAX: parseInteger(
      config.FORGOT_PASSWORD_RATE_LIMIT_MAX,
      'FORGOT_PASSWORD_RATE_LIMIT_MAX',
      5,
    ),
    FORGOT_PASSWORD_RATE_LIMIT_WINDOW_SECONDS: parseInteger(
      config.FORGOT_PASSWORD_RATE_LIMIT_WINDOW_SECONDS,
      'FORGOT_PASSWORD_RATE_LIMIT_WINDOW_SECONDS',
      3600,
    ),
    RESET_PASSWORD_RATE_LIMIT_MAX: parseInteger(
      config.RESET_PASSWORD_RATE_LIMIT_MAX,
      'RESET_PASSWORD_RATE_LIMIT_MAX',
      5,
    ),
    RESET_PASSWORD_RATE_LIMIT_WINDOW_SECONDS: parseInteger(
      config.RESET_PASSWORD_RATE_LIMIT_WINDOW_SECONDS,
      'RESET_PASSWORD_RATE_LIMIT_WINDOW_SECONDS',
      900,
    ),
    FORGOT_PASSWORD_MIN_DURATION_MS: parseInteger(
      config.FORGOT_PASSWORD_MIN_DURATION_MS,
      'FORGOT_PASSWORD_MIN_DURATION_MS',
      400,
    ),
    FLAG_SUBMISSION_RATE_LIMIT_MAX: parseInteger(
      config.FLAG_SUBMISSION_RATE_LIMIT_MAX,
      'FLAG_SUBMISSION_RATE_LIMIT_MAX',
      10,
    ),
    FLAG_SUBMISSION_RATE_LIMIT_WINDOW_SECONDS: parseInteger(
      config.FLAG_SUBMISSION_RATE_LIMIT_WINDOW_SECONDS,
      'FLAG_SUBMISSION_RATE_LIMIT_WINDOW_SECONDS',
      300,
    ),
    LAB_START_RATE_LIMIT_MAX: parseInteger(
      config.LAB_START_RATE_LIMIT_MAX,
      'LAB_START_RATE_LIMIT_MAX',
      5,
    ),
    LAB_START_RATE_LIMIT_WINDOW_SECONDS: parseInteger(
      config.LAB_START_RATE_LIMIT_WINDOW_SECONDS,
      'LAB_START_RATE_LIMIT_WINDOW_SECONDS',
      300,
    ),
    LAB_RESET_RATE_LIMIT_MAX: parseInteger(
      config.LAB_RESET_RATE_LIMIT_MAX,
      'LAB_RESET_RATE_LIMIT_MAX',
      10,
    ),
    LAB_RESET_RATE_LIMIT_WINDOW_SECONDS: parseInteger(
      config.LAB_RESET_RATE_LIMIT_WINDOW_SECONDS,
      'LAB_RESET_RATE_LIMIT_WINDOW_SECONDS',
      300,
    ),
    LAB_TERMINATE_RATE_LIMIT_MAX: parseInteger(
      config.LAB_TERMINATE_RATE_LIMIT_MAX,
      'LAB_TERMINATE_RATE_LIMIT_MAX',
      10,
    ),
    LAB_TERMINATE_RATE_LIMIT_WINDOW_SECONDS: parseInteger(
      config.LAB_TERMINATE_RATE_LIMIT_WINDOW_SECONDS,
      'LAB_TERMINATE_RATE_LIMIT_WINDOW_SECONDS',
      300,
    ),
    EMAIL_PROVIDER: emailProvider,
    RESEND_API_KEY: resendApiKey,
    MAIL_FROM: explicitMailFrom || 'no-reply@example.com',
    APP_NAME: trimOptional(config.APP_NAME) || 'Cyber Academy Web',
    MAIL_HOST: mailHost,
    MAIL_PORT: mailPort,
    MAIL_USER: mailUser,
    MAIL_PASS: mailPass,
    MFA_ATTEMPT_MAX_FAILURES: parseInteger(
      config.MFA_ATTEMPT_MAX_FAILURES,
      'MFA_ATTEMPT_MAX_FAILURES',
      5,
    ),
    MFA_ATTEMPT_WINDOW_SECONDS: parseInteger(
      config.MFA_ATTEMPT_WINDOW_SECONDS,
      'MFA_ATTEMPT_WINDOW_SECONDS',
      300,
    ),
    MFA_ATTEMPT_LOCK_SECONDS: parseInteger(
      config.MFA_ATTEMPT_LOCK_SECONDS,
      'MFA_ATTEMPT_LOCK_SECONDS',
      900,
    ),
    LAB_ORCHESTRATOR_BASE_URL: String(config.LAB_ORCHESTRATOR_BASE_URL),
    LAB_ORCHESTRATOR_API_KEY: String(config.LAB_ORCHESTRATOR_API_KEY),
    LAB_ORCHESTRATOR_TIMEOUT_MS: parseInteger(
      config.LAB_ORCHESTRATOR_TIMEOUT_MS,
      'LAB_ORCHESTRATOR_TIMEOUT_MS',
      10000,
    ),
    LAB_PROXY_BASE_URL: String(config.LAB_PROXY_BASE_URL),
    GEMMA_PROVIDER: gemmaProvider,
    GEMMA_API_KEY: gemmaApiKey,
    GEMMA_MODEL: gemmaModel,
    OLLAMA_ENABLED: ollamaEnabled,
    OLLAMA_BASE_URL: ollamaBaseUrl,
    OLLAMA_MODEL: ollamaModel,
    OLLAMA_TIMEOUT_MS: ollamaTimeoutMs,
    GEMINI_ENABLED: geminiEnabled,
    AI_PROVIDER_PRIORITY: aiProviderPriority,
  };
};
