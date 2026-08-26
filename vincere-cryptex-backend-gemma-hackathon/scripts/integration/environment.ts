const EXPECTED_DATABASE = {
  protocol: 'postgresql:',
  hostname: '127.0.0.1',
  port: '55432',
  username: 'cyber_academy_integration',
  password: 'integration_test_only',
  pathname: '/cyber_academy_integration_test',
} as const;

const EXPECTED_REDIS = {
  protocol: 'redis:',
  hostname: '127.0.0.1',
  port: '56379',
  username: 'cyber_academy_integration',
  password: 'integration_test_only',
  pathname: '/15',
} as const;

export const INTEGRATION_DATABASE_CLUSTER = 'cyber-academy-backend-integration';
export const INTEGRATION_REDIS_KEY_PREFIX = 'integration:pf05d:';

type EnvironmentSource = Record<string, string | undefined>;

export interface IntegrationEnvironment {
  databaseUrl: string;
  redisUrl: string;
  databaseName: string;
  databaseUser: string;
  databasePort: number;
  redisUser: string;
  redisDatabase: number;
}

export const buildIntegrationTestProcessEnvironment = (
  source: EnvironmentSource,
): NodeJS.ProcessEnv => {
  const environment = validateIntegrationEnvironment(source);

  return {
    ...source,
    NODE_ENV: 'test',
    INTEGRATION_TEST: 'true',
    PORT: '0',
    TRUST_PROXY: 'false',
    APP_BASE_URL: 'http://127.0.0.1:3000',
    FRONTEND_ORIGIN: 'http://127.0.0.1:3001',
    FRONTEND_URL: 'http://127.0.0.1:3001',
    DATABASE_URL: environment.databaseUrl,
    REDIS_URL: environment.redisUrl,
    SESSION_SECRET: 'pf05e-integration-session-secret-public-test-only',
    SESSION_COOKIE_NAME: 'pf05e_session',
    COOKIE_SECURE: 'false',
    COOKIE_DOMAIN: '',
    SESSION_TTL_SECONDS: '3600',
    SESSION_IDLE_TTL_SECONDS: '1800',
    AUTH_STATE_CACHE_TTL_SECONDS: '30',
    MFA_ENCRYPTION_KEY: 'a5'.repeat(32),
    MFA_ISSUER: 'Cyber Academy Integration Tests',
    PASSWORD_RESET_TOKEN_TTL_MINUTES: '15',
    EMAIL_VERIFICATION_TOKEN_TTL_HOURS: '24',
    FORGOT_PASSWORD_MIN_DURATION_MS: '0',
    EMAIL_PROVIDER: 'smtp',
    RESEND_API_KEY: '',
    MAIL_FROM: 'auth-integration@example.invalid',
    APP_NAME: 'Cyber Academy Integration Tests',
    MAIL_HOST: '',
    MAIL_PORT: '',
    MAIL_USER: '',
    MAIL_PASS: '',
    MFA_ATTEMPT_MAX_FAILURES: '5',
    MFA_ATTEMPT_WINDOW_SECONDS: '900',
    MFA_ATTEMPT_LOCK_SECONDS: '900',
    LAB_ORCHESTRATOR_BASE_URL: 'http://127.0.0.1:59991',
    LAB_ORCHESTRATOR_API_KEY: 'pf05e-integration-lab-key-public-test-only',
    LAB_ORCHESTRATOR_TIMEOUT_MS: '1000',
    LAB_PROXY_BASE_URL: 'http://127.0.0.1:59992',
    GEMMA_PROVIDER: 'mock',
    GEMMA_API_KEY: '',
    GEMMA_MODEL: '',
    OLLAMA_ENABLED: 'false',
    OLLAMA_BASE_URL: 'http://127.0.0.1:59993',
    OLLAMA_MODEL: 'integration-disabled',
    OLLAMA_TIMEOUT_MS: '1000',
    GEMINI_ENABLED: 'false',
    AI_PROVIDER_PRIORITY: 'local-first',
  };
};

export class IntegrationSafetyError extends Error {
  constructor(message: string) {
    super(`Refusing integration operation: ${message}`);
    this.name = 'IntegrationSafetyError';
  }
}

const refuseUnless = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new IntegrationSafetyError(message);
  }
};

const requiredValue = (source: EnvironmentSource, name: string): string => {
  const value = source[name];
  refuseUnless(typeof value === 'string' && value.length > 0, `${name} is required`);
  return value as string;
};

const parseTargetUrl = (value: string, name: string): URL => {
  try {
    return new URL(value);
  } catch {
    throw new IntegrationSafetyError(`${name} must be a valid URL`);
  }
};

const decodedCredential = (value: string, name: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new IntegrationSafetyError(`${name} contains invalid URL encoding`);
  }
};

const validateDatabaseUrl = (value: string): URL => {
  const target = parseTargetUrl(value, 'DATABASE_URL');

  refuseUnless(
    target.protocol === EXPECTED_DATABASE.protocol,
    'DATABASE_URL protocol is not test-safe',
  );
  refuseUnless(
    target.hostname === EXPECTED_DATABASE.hostname,
    'DATABASE_URL host is not the dedicated loopback target',
  );
  refuseUnless(
    target.port === EXPECTED_DATABASE.port,
    'DATABASE_URL port is not the dedicated test port',
  );
  refuseUnless(
    decodedCredential(target.username, 'DATABASE_URL username') === EXPECTED_DATABASE.username,
    'DATABASE_URL user is not the dedicated test user',
  );
  refuseUnless(
    decodedCredential(target.password, 'DATABASE_URL password') === EXPECTED_DATABASE.password,
    'DATABASE_URL password is not the public test-only credential',
  );
  refuseUnless(
    target.pathname === EXPECTED_DATABASE.pathname,
    'DATABASE_URL database name is not the explicit integration-test database',
  );
  refuseUnless(target.hash === '', 'DATABASE_URL must not contain a fragment');

  const queryParameters = [...target.searchParams.entries()];
  refuseUnless(
    queryParameters.length === 1 &&
      queryParameters[0][0] === 'schema' &&
      queryParameters[0][1] === 'public',
    'DATABASE_URL may only select the public schema',
  );

  return target;
};

const validateRedisUrl = (value: string): URL => {
  const target = parseTargetUrl(value, 'REDIS_URL');

  refuseUnless(target.protocol === EXPECTED_REDIS.protocol, 'REDIS_URL protocol is not test-safe');
  refuseUnless(
    target.hostname === EXPECTED_REDIS.hostname,
    'REDIS_URL host is not the dedicated loopback target',
  );
  refuseUnless(
    target.port === EXPECTED_REDIS.port,
    'REDIS_URL port is not the dedicated test port',
  );
  refuseUnless(
    decodedCredential(target.username, 'REDIS_URL username') === EXPECTED_REDIS.username,
    'REDIS_URL user is not the dedicated test ACL user',
  );
  refuseUnless(
    decodedCredential(target.password, 'REDIS_URL password') === EXPECTED_REDIS.password,
    'REDIS_URL password is not the public test-only credential',
  );
  refuseUnless(
    target.pathname === EXPECTED_REDIS.pathname,
    'REDIS_URL must select dedicated database 15',
  );
  refuseUnless(
    target.search === '' && target.hash === '',
    'REDIS_URL must not contain a query or fragment',
  );

  return target;
};

export const validateIntegrationEnvironment = (
  source: EnvironmentSource,
): IntegrationEnvironment => {
  refuseUnless(source.NODE_ENV === 'test', 'NODE_ENV must be exactly "test"');
  refuseUnless(
    source.INTEGRATION_TEST === 'true',
    'INTEGRATION_TEST must be explicitly set to "true"',
  );

  const databaseUrl = requiredValue(source, 'DATABASE_URL');
  const redisUrl = requiredValue(source, 'REDIS_URL');
  const databaseTarget = validateDatabaseUrl(databaseUrl);
  const redisTarget = validateRedisUrl(redisUrl);

  return {
    databaseUrl,
    redisUrl,
    databaseName: databaseTarget.pathname.slice(1),
    databaseUser: decodedCredential(databaseTarget.username, 'DATABASE_URL username'),
    databasePort: Number(databaseTarget.port),
    redisUser: decodedCredential(redisTarget.username, 'REDIS_URL username'),
    redisDatabase: Number(redisTarget.pathname.slice(1)),
  };
};
