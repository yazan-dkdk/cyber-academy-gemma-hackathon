import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  AI_TUTOR_CONCURRENCY_LOCK_DEFAULT_TTL_SECONDS,
  AI_TUTOR_DAILY_QUOTA_DEFAULT,
  AI_TUTOR_RATE_LIMIT_DEFAULT_MAX,
  AI_TUTOR_RATE_LIMIT_DEFAULT_WINDOW_SECONDS,
} from '../ai-tutor/ai-tutor.constants';
import { validateEnvironment } from './environment';

const developmentEnvironment = (): Record<string, unknown> => ({
  NODE_ENV: 'development',
  APP_BASE_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/cyber_academy',
  REDIS_URL: 'redis://localhost:6379',
  SESSION_SECRET: 'local-session-value',
  SESSION_COOKIE_NAME: 'sid',
  MFA_ENCRYPTION_KEY: '01'.repeat(32),
  LAB_ORCHESTRATOR_BASE_URL: 'http://localhost:4000',
  LAB_ORCHESTRATOR_API_KEY: 'local-orchestrator-value',
  LAB_PROXY_BASE_URL: 'http://localhost:4001',
  OLLAMA_ENABLED: 'true',
  OLLAMA_TIMEOUT_MS: '60000',
  GEMINI_ENABLED: 'false',
});

const productionEnvironment = (): Record<string, unknown> => ({
  NODE_ENV: 'production',
  APP_BASE_URL: 'https://api.academy.invalid',
  FRONTEND_ORIGIN: 'https://academy.invalid',
  FRONTEND_URL: 'https://academy.invalid',
  DATABASE_URL: 'postgresql://academy:R7n4L2m9@database.academy.invalid:5432/academy',
  REDIS_URL: 'rediss://default:R9q4Vm2xK8s7@cache.academy.invalid:6379/0',
  SESSION_SECRET: 'Q7vN2kLm9R4xT6pW8cD3sF5hJ1zB0yUa',
  SESSION_COOKIE_NAME: 'sid',
  COOKIE_SECURE: 'true',
  COOKIE_DOMAIN: '',
  MFA_ENCRYPTION_KEY: 'a1'.repeat(32),
  LAB_ORCHESTRATOR_BASE_URL: 'https://labs.academy.invalid',
  LAB_ORCHESTRATOR_API_KEY: 'K9mR2vT7xP4nC8qL5sW1zD6hF3jB0uYa',
  LAB_PROXY_BASE_URL: 'https://lab-proxy.academy.invalid',
  EMAIL_PROVIDER: 'resend',
  RESEND_API_KEY: 're_7qN4vB9xL2mT8cK5pR1sW6yH',
  MAIL_FROM: 'security@academy.invalid',
  GEMMA_PROVIDER: 'ollama',
  OLLAMA_ENABLED: 'true',
  OLLAMA_BASE_URL: 'https://ollama.internal.invalid',
  OLLAMA_MODEL: 'gemma-3-12b-it',
  OLLAMA_TIMEOUT_MS: '60000',
  GEMINI_ENABLED: 'false',
  AI_PROVIDER_PRIORITY: 'local-first',
  AI_TUTOR_RATE_LIMIT_MAX: '5',
  AI_TUTOR_RATE_LIMIT_WINDOW_SECONDS: '60',
  AI_TUTOR_DAILY_QUOTA: '100',
  AI_TUTOR_CONCURRENCY_LOCK_TTL_SECONDS: '120',
});

describe('AI Tutor environment validation', () => {
  test('uses the documented development defaults', () => {
    const environment = validateEnvironment(developmentEnvironment());

    assert.equal(environment.AI_TUTOR_RATE_LIMIT_MAX, AI_TUTOR_RATE_LIMIT_DEFAULT_MAX);
    assert.equal(
      environment.AI_TUTOR_RATE_LIMIT_WINDOW_SECONDS,
      AI_TUTOR_RATE_LIMIT_DEFAULT_WINDOW_SECONDS,
    );
    assert.equal(environment.AI_TUTOR_DAILY_QUOTA, AI_TUTOR_DAILY_QUOTA_DEFAULT);
    assert.equal(
      environment.AI_TUTOR_CONCURRENCY_LOCK_TTL_SECONDS,
      AI_TUTOR_CONCURRENCY_LOCK_DEFAULT_TTL_SECONDS,
    );
  });

  test('requires every AI protection setting explicitly in production', () => {
    for (const fieldName of [
      'AI_TUTOR_RATE_LIMIT_MAX',
      'AI_TUTOR_RATE_LIMIT_WINDOW_SECONDS',
      'AI_TUTOR_DAILY_QUOTA',
      'AI_TUTOR_CONCURRENCY_LOCK_TTL_SECONDS',
    ]) {
      const environment = productionEnvironment();
      delete environment[fieldName];
      assert.throws(
        () => validateEnvironment(environment),
        new RegExp(`${fieldName} is required in production`),
        fieldName,
      );
    }
  });

  test('rejects fractional, suffixed, and otherwise non-integer AI settings', () => {
    const cases: Array<[string, unknown]> = [
      ['AI_TUTOR_RATE_LIMIT_MAX', '5.5'],
      ['AI_TUTOR_RATE_LIMIT_WINDOW_SECONDS', '60seconds'],
      ['AI_TUTOR_DAILY_QUOTA', Number.NaN],
      ['AI_TUTOR_CONCURRENCY_LOCK_TTL_SECONDS', Number.POSITIVE_INFINITY],
    ];

    for (const [fieldName, invalidValue] of cases) {
      const environment = productionEnvironment();
      environment[fieldName] = invalidValue;
      assert.throws(
        () => validateEnvironment(environment),
        new RegExp(`${fieldName} must be an integer`),
        fieldName,
      );
    }
  });

  test('rejects zero, negative, and unreasonably large AI settings', () => {
    const cases: Array<[string, unknown, RegExp]> = [
      ['AI_TUTOR_RATE_LIMIT_MAX', '0', /between 1 and 100/],
      ['AI_TUTOR_RATE_LIMIT_MAX', '-1', /between 1 and 100/],
      ['AI_TUTOR_RATE_LIMIT_MAX', '101', /between 1 and 100/],
      ['AI_TUTOR_RATE_LIMIT_WINDOW_SECONDS', '0', /between 10 and 3600/],
      ['AI_TUTOR_RATE_LIMIT_WINDOW_SECONDS', '-1', /between 10 and 3600/],
      ['AI_TUTOR_RATE_LIMIT_WINDOW_SECONDS', '3601', /between 10 and 3600/],
      ['AI_TUTOR_DAILY_QUOTA', '0', /between 1 and 1000/],
      ['AI_TUTOR_DAILY_QUOTA', '-1', /between 1 and 1000/],
      ['AI_TUTOR_DAILY_QUOTA', '1001', /between 1 and 1000/],
      ['AI_TUTOR_CONCURRENCY_LOCK_TTL_SECONDS', '0', /between 31 and 600/],
      ['AI_TUTOR_CONCURRENCY_LOCK_TTL_SECONDS', '-1', /between 31 and 600/],
      ['AI_TUTOR_CONCURRENCY_LOCK_TTL_SECONDS', '601', /between 31 and 600/],
    ];

    for (const [fieldName, invalidValue, expectedError] of cases) {
      const environment = productionEnvironment();
      environment[fieldName] = invalidValue;
      assert.throws(() => validateEnvironment(environment), expectedError, fieldName);
    }
  });

  test('accepts the documented inclusive bounds', () => {
    const environment = productionEnvironment();
    environment.AI_TUTOR_RATE_LIMIT_MAX = '100';
    environment.AI_TUTOR_RATE_LIMIT_WINDOW_SECONDS = '3600';
    environment.AI_TUTOR_DAILY_QUOTA = '1000';
    environment.AI_TUTOR_CONCURRENCY_LOCK_TTL_SECONDS = '600';

    const validated = validateEnvironment(environment);
    assert.equal(validated.AI_TUTOR_RATE_LIMIT_MAX, 100);
    assert.equal(validated.AI_TUTOR_RATE_LIMIT_WINDOW_SECONDS, 3600);
    assert.equal(validated.AI_TUTOR_DAILY_QUOTA, 1000);
    assert.equal(validated.AI_TUTOR_CONCURRENCY_LOCK_TTL_SECONDS, 600);
  });

  test('requires the concurrency TTL to cover the enabled provider flow plus buffer', () => {
    const environment = productionEnvironment();
    environment.AI_TUTOR_CONCURRENCY_LOCK_TTL_SECONDS = '65';

    assert.throws(
      () => validateEnvironment(environment),
      /AI_TUTOR_CONCURRENCY_LOCK_TTL_SECONDS must be at least 66 seconds/,
    );

    environment.AI_TUTOR_CONCURRENCY_LOCK_TTL_SECONDS = '66';
    assert.equal(validateEnvironment(environment).AI_TUTOR_CONCURRENCY_LOCK_TTL_SECONDS, 66);
  });
});
