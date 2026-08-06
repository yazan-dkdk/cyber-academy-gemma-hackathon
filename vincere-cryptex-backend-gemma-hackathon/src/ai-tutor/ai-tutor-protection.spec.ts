import 'reflect-metadata';

import {
  ArgumentsHost,
  ExecutionContext,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { UserRole, UserStatus } from '@prisma/client';
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { AuthStateService } from '../auth/auth-state.service';
import { RATE_LIMIT_PRESET_KEY, RateLimitPreset } from '../common/decorators/rate-limit.decorator';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { AllExceptionsFilter } from '../common/exceptions/all-exceptions.filter';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { AppConfigService } from '../config/app-config.service';
import { RedisService } from '../redis/redis.service';
import { SessionService } from '../session/session.service';
import { SessionRecord, UserAuthState } from '../session/session.types';
import { AiTutorController } from './ai-tutor.controller';
import { AiTutorService } from './ai-tutor.service';
import { AiTutorUsageService } from './ai-tutor-usage.service';
import { AskAiTutorDto } from './dto/ask-ai-tutor.dto';
import { AiSafetyGuard } from './guards/ai-safety.guard';
import { GeminiProvider } from './providers/gemini.provider';
import { OllamaProvider } from './providers/ollama.provider';
import { SafeMockProvider } from './providers/safe-mock.provider';

const STUDENT_ID = 'student-00000000-0000-4000-8000-000000000001';

const activeStudent: AuthenticatedUser = {
  id: STUDENT_ID,
  email: 'student@academy.invalid',
  role: UserRole.STUDENT,
  status: UserStatus.ACTIVE,
  sessionVersion: 1,
  adminMfaEnabled: false,
};

const sessionRecord: SessionRecord = {
  sessionId: 'signed-session-value',
  userId: activeStudent.id,
  email: activeStudent.email,
  role: activeStudent.role,
  userStatus: activeStudent.status,
  emailVerifiedAt: '2026-01-01T00:00:00.000Z',
  sessionVersion: activeStudent.sessionVersion,
  adminMfaEnabled: activeStudent.adminMfaEnabled,
  authLevel: 'PASSWORD',
  adminMfaVerifiedAt: null,
  deletedAt: null,
  clientBinding: {
    ipHash: null,
    ipSubnetHash: null,
    userAgentHash: null,
  },
  createdAt: '2026-01-01T00:00:00.000Z',
  lastSeenAt: '2026-01-01T00:00:00.000Z',
};

const userAuthState: UserAuthState = {
  userId: activeStudent.id,
  email: activeStudent.email,
  role: activeStudent.role,
  userStatus: activeStudent.status,
  emailVerifiedAt: sessionRecord.emailVerifiedAt,
  sessionVersion: activeStudent.sessionVersion,
  adminMfaEnabled: activeStudent.adminMfaEnabled,
  deletedAt: null,
};

const executionContextFor = (request: AuthenticatedRequest): ExecutionContext =>
  ({
    getClass: () => AiTutorController,
    getHandler: () => AiTutorController.prototype.ask,
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  }) as unknown as ExecutionContext;

const authenticatedRequest = (
  user: AuthenticatedUser = activeStudent,
  overrides: Partial<AuthenticatedRequest> = {},
): AuthenticatedRequest =>
  ({
    ip: '198.51.100.10',
    method: 'POST',
    url: '/api/ai-tutor/ask',
    body: {},
    auth: {
      sessionId: sessionRecord.sessionId,
      session: {
        ...sessionRecord,
        userId: user.id,
        email: user.email,
        role: user.role,
        userStatus: user.status,
        sessionVersion: user.sessionVersion,
        adminMfaEnabled: user.adminMfaEnabled,
      },
      user,
    },
    ...overrides,
  }) as AuthenticatedRequest;

const captureException = async (operation: Promise<unknown>): Promise<unknown> => {
  try {
    await operation;
  } catch (error) {
    return error;
  }

  assert.fail('Expected operation to reject');
};

const captureSynchronousException = (operation: () => unknown): unknown => {
  try {
    operation();
  } catch (error) {
    return error;
  }

  assert.fail('Expected operation to throw');
};

const expectHttpStatus = (error: unknown, status: number): HttpException => {
  assert.ok(error instanceof HttpException);
  assert.equal(error.getStatus(), status);
  return error;
};

const captureLogger = (target: object): string[] => {
  const messages: string[] = [];
  const record = (message: unknown) => messages.push(String(message));

  Object.defineProperty(target, 'logger', {
    configurable: true,
    value: {
      log: record,
      warn: record,
      error: record,
    },
  });

  return messages;
};

const usageConfig = (isProduction = true): AppConfigService =>
  ({
    isProduction,
    aiTutorConcurrencyLockTtlSeconds: 120,
    aiTutorDailyQuota: 100,
  }) as AppConfigService;

const parseEvents = (messages: string[]): Array<Record<string, unknown>> =>
  messages.map((message) => JSON.parse(message) as Record<string, unknown>);

describe('AI Tutor endpoint security', () => {
  test('preserves authentication, STUDENT role, rate-limit metadata, and the normal active flow', async () => {
    const classGuards = Reflect.getMetadata(GUARDS_METADATA, AiTutorController) as unknown[];
    const routeGuards = Reflect.getMetadata(
      GUARDS_METADATA,
      AiTutorController.prototype.ask,
    ) as unknown[];

    assert.ok(classGuards.includes(AuthenticatedGuard));
    assert.ok(classGuards.includes(RolesGuard));
    assert.ok(routeGuards.includes(RateLimitGuard));
    assert.deepEqual(Reflect.getMetadata(ROLES_KEY, AiTutorController), [UserRole.STUDENT]);
    assert.equal(
      Reflect.getMetadata(RATE_LIMIT_PRESET_KEY, AiTutorController.prototype.ask),
      RateLimitPreset.AI_TUTOR_ASK,
    );

    const request = authenticatedRequest();
    delete request.auth;
    const sessionService = {
      extractSignedSessionId: () => sessionRecord.sessionId,
      getSession: async () => sessionRecord,
      validateClientBinding: () => ({
        valid: true,
        nextBinding: sessionRecord.clientBinding,
      }),
      refreshSession: async () => sessionRecord,
      destroySession: async () => undefined,
    } as unknown as SessionService;
    const authStateService = {
      getOrHydrateUserAuthState: async () => userAuthState,
      clearUserAuthState: async () => undefined,
    } as unknown as AuthStateService;
    const authGuard = new AuthenticatedGuard(authStateService, sessionService);

    assert.equal(await authGuard.canActivate(executionContextFor(request)), true);
    const hydratedUser = (
      request as unknown as { auth: { user: AuthenticatedUser } }
    ).auth.user;
    assert.equal(hydratedUser.id, activeStudent.id);

    const rolesGuard = new RolesGuard(new Reflector());
    assert.equal(rolesGuard.canActivate(executionContextFor(request)), true);

    const askCalls: Array<{ body: AskAiTutorDto; userId: string }> = [];
    const aiTutorService = {
      ask: async (body: AskAiTutorDto, userId: string) => {
        askCalls.push({ body, userId });
        return {
          type: 'explanation' as const,
          answer: 'A safe answer',
          blocked: false,
          safetyLevel: 'safe' as const,
        };
      },
    } as unknown as AiTutorService;
    const controller = new AiTutorController(aiTutorService);
    const body: AskAiTutorDto = {
      lessonTitle: 'Security foundations',
      question: 'Explain this concept.',
    };

    const response = await controller.ask(hydratedUser, body);
    assert.equal(response.answer, 'A safe answer');
    assert.deepEqual(askCalls, [{ body, userId: activeStudent.id }]);
  });

  test('rejects unauthenticated and non-STUDENT requests', async () => {
    const request = authenticatedRequest();
    delete request.auth;
    const sessionService = {
      extractSignedSessionId: () => null,
    } as unknown as SessionService;
    const authGuard = new AuthenticatedGuard({} as AuthStateService, sessionService);

    const unauthenticatedError = await captureException(
      authGuard.canActivate(executionContextFor(request)),
    );
    expectHttpStatus(unauthenticatedError, HttpStatus.UNAUTHORIZED);

    const instructor: AuthenticatedUser = {
      ...activeStudent,
      role: UserRole.INSTRUCTOR,
    };
    const instructorRequest = authenticatedRequest(instructor);
    const rolesGuard = new RolesGuard(new Reflector());
    const roleError = captureSynchronousException(() =>
      rolesGuard.canActivate(executionContextFor(instructorRequest)),
    );
    expectHttpStatus(roleError, HttpStatus.FORBIDDEN);
  });

  test('uses a per-user short-window key, reaches 429, emits sanitized logs, and exposes Retry-After', async () => {
    const counts = new Map<string, number>();
    const calls: Array<{
      key: string;
      windowSeconds: number;
      failClosed: boolean | undefined;
    }> = [];
    const redisService = {
      incrementRateLimit: async (
        key: string,
        windowSeconds: number,
        options?: { failClosed?: boolean },
      ) => {
        const count = (counts.get(key) ?? 0) + 1;
        counts.set(key, count);
        calls.push({ key, windowSeconds, failClosed: options?.failClosed });
        return { count, ttlSeconds: 44 };
      },
    } as unknown as RedisService;
    const configService = {
      isProduction: true,
      aiTutorRateLimit: { max: 2, windowSeconds: 60 },
    } as AppConfigService;
    const guard = new RateLimitGuard(new Reflector(), redisService, configService);
    const logs = captureLogger(guard);
    const sensitiveValues = [
      'PROMPT_PRIVATE_3e827',
      'LESSON_PRIVATE_81a62',
      'COOKIE_PRIVATE_5f10d',
      'SESSION_PRIVATE_4a993',
    ];

    const firstRequest = authenticatedRequest(activeStudent, {
      ip: '198.51.100.10',
      body: {
        question: sensitiveValues[0],
        lessonContent: sensitiveValues[1],
      },
      cookies: { sid: sensitiveValues[2] },
    });
    firstRequest.auth!.sessionId = sensitiveValues[3];
    const secondRequest = authenticatedRequest(activeStudent, { ip: '203.0.113.20' });
    const thirdRequest = authenticatedRequest(activeStudent, { ip: '192.0.2.30' });

    assert.equal(await guard.canActivate(executionContextFor(firstRequest)), true);
    assert.equal(await guard.canActivate(executionContextFor(secondRequest)), true);
    const rateLimitError = expectHttpStatus(
      await captureException(guard.canActivate(executionContextFor(thirdRequest))),
      HttpStatus.TOO_MANY_REQUESTS,
    );

    assert.deepEqual(
      calls.map((call) => call.key),
      Array.from({ length: 3 }, () => `rate-limit:ai-tutor:ask:${activeStudent.id}`),
    );
    assert.ok(calls.every((call) => call.windowSeconds === 60 && call.failClosed === true));
    assert.deepEqual(rateLimitError.getResponse(), {
      message: 'Too many requests',
      retryAfterSeconds: 44,
    });

    const headers = new Map<string, string>();
    let statusCode = 0;
    let responseBody: unknown;
    const reply = {
      header: (name: string, value: string) => {
        headers.set(name, value);
        return reply;
      },
      status: (status: number) => {
        statusCode = status;
        return reply;
      },
      send: (body: unknown) => {
        responseBody = body;
        return reply;
      },
    };
    const host = {
      switchToHttp: () => ({
        getResponse: () => reply,
        getRequest: () => ({ method: 'POST', url: '/api/ai-tutor/ask' }),
      }),
    } as unknown as ArgumentsHost;
    new AllExceptionsFilter().catch(rateLimitError, host);

    assert.equal(statusCode, HttpStatus.TOO_MANY_REQUESTS);
    assert.equal(headers.get('Retry-After'), '44');
    assert.deepEqual((responseBody as { error: unknown }).error, rateLimitError.getResponse());

    const events = parseEvents(logs);
    assert.ok(
      events.some(
        (event) =>
          event.event === 'ai_tutor.request.rejected' &&
          event.reason === 'short_window_rate_limit',
      ),
    );
    const serializedLogs = logs.join('\n');
    for (const sensitiveValue of sensitiveValues) {
      assert.equal(serializedLogs.includes(sensitiveValue), false);
    }
  });

  test('fails closed on short-window Redis enforcement failure in production', async () => {
    let downstreamReached = false;
    const redisService = {
      incrementRateLimit: async (
        _key: string,
        _windowSeconds: number,
        options?: { failClosed?: boolean },
      ) => {
        assert.equal(options?.failClosed, true);
        throw new ServiceUnavailableException('Security controls unavailable');
      },
    } as unknown as RedisService;
    const guard = new RateLimitGuard(
      new Reflector(),
      redisService,
      {
        isProduction: true,
        aiTutorRateLimit: { max: 5, windowSeconds: 60 },
      } as AppConfigService,
    );

    const error = await captureException(
      guard.canActivate(executionContextFor(authenticatedRequest())),
    );
    expectHttpStatus(error, HttpStatus.SERVICE_UNAVAILABLE);
    assert.equal(downstreamReached, false);
  });
});

describe('AI Tutor concurrency and daily quota coordination', () => {
  test('orders lock, quota, provider execution, and token-safe release; admission is idempotent', async () => {
    const events: string[] = [];
    let ownerToken = '';
    let quotaCalls = 0;
    const redisService = {
      acquireLock: async (
        key: string,
        token: string,
        ttlSeconds: number,
        options?: { failClosed?: boolean },
      ) => {
        events.push('lock');
        assert.equal(key, `ai-tutor:usage:concurrency:${STUDENT_ID}`);
        assert.equal(ttlSeconds, 120);
        assert.equal(options?.failClosed, true);
        ownerToken = token;
        return { acquired: true, ttlSeconds };
      },
      consumeDailyQuota: async (
        key: string,
        max: number,
        options?: { failClosed?: boolean },
      ) => {
        events.push('quota');
        quotaCalls += 1;
        assert.equal(key, `ai-tutor:usage:daily:${STUDENT_ID}`);
        assert.equal(max, 100);
        assert.equal(options?.failClosed, true);
        return { allowed: true, count: 1, ttlSeconds: 500 };
      },
      releaseLock: async (key: string, token: string) => {
        events.push('release');
        assert.equal(key, `ai-tutor:usage:concurrency:${STUDENT_ID}`);
        assert.equal(token, ownerToken);
        return true;
      },
    } as unknown as RedisService;
    const service = new AiTutorUsageService(redisService, usageConfig());
    const logs = captureLogger(service);

    const result = await service.withConcurrencyProtection(STUDENT_ID, async (admit) => {
      events.push('operation');
      await admit();
      await admit();
      events.push('provider');
      return 'provider-result';
    });

    assert.equal(result, 'provider-result');
    assert.equal(quotaCalls, 1);
    assert.deepEqual(events, ['lock', 'operation', 'quota', 'provider', 'release']);
    const logEvents = parseEvents(logs);
    assert.ok(logEvents.some((event) => event.event === 'ai_tutor.request.accepted'));
    assert.ok(
      logEvents.some(
        (event) =>
          event.event === 'ai_tutor.request.completed' &&
          event.outcome === 'success' &&
          event.quotaConsumed === true &&
          typeof event.durationMs === 'number',
      ),
    );
  });

  test('rejects a concurrent request before quota or provider execution', async () => {
    let quotaCalls = 0;
    let operationCalls = 0;
    let releaseCalls = 0;
    const redisService = {
      acquireLock: async () => ({ acquired: false, ttlSeconds: 73 }),
      consumeDailyQuota: async () => {
        quotaCalls += 1;
        return { allowed: true, count: 1, ttlSeconds: 100 };
      },
      releaseLock: async () => {
        releaseCalls += 1;
        return true;
      },
    } as unknown as RedisService;
    const service = new AiTutorUsageService(redisService, usageConfig());
    const logs = captureLogger(service);

    const error = expectHttpStatus(
      await captureException(
        service.withConcurrencyProtection(STUDENT_ID, async () => {
          operationCalls += 1;
          return 'unreachable';
        }),
      ),
      HttpStatus.TOO_MANY_REQUESTS,
    );

    assert.deepEqual(error.getResponse(), {
      message: 'An AI Tutor request is already in progress',
      code: 'AI_TUTOR_CONCURRENCY_LIMIT',
      retryAfterSeconds: 73,
    });
    assert.equal(operationCalls, 0);
    assert.equal(quotaCalls, 0);
    assert.equal(releaseCalls, 0);
    assert.ok(
      parseEvents(logs).some(
        (event) => event.event === 'ai_tutor.request.rejected' && event.reason === 'concurrency_limit',
      ),
    );
  });

  test('rejects an exhausted daily quota before provider execution and releases the lock', async () => {
    const events: string[] = [];
    let providerReached = false;
    let ownerToken = '';
    const redisService = {
      acquireLock: async (_key: string, token: string) => {
        events.push('lock');
        ownerToken = token;
        return { acquired: true, ttlSeconds: 120 };
      },
      consumeDailyQuota: async () => {
        events.push('quota');
        return { allowed: false, count: 100, ttlSeconds: 12_345 };
      },
      releaseLock: async (_key: string, token: string) => {
        events.push('release');
        assert.equal(token, ownerToken);
        return true;
      },
    } as unknown as RedisService;
    const service = new AiTutorUsageService(redisService, usageConfig());
    const logs = captureLogger(service);

    const error = expectHttpStatus(
      await captureException(
        service.withConcurrencyProtection(STUDENT_ID, async (admit) => {
          events.push('operation');
          await admit();
          providerReached = true;
          return 'unreachable';
        }),
      ),
      HttpStatus.TOO_MANY_REQUESTS,
    );

    assert.deepEqual(error.getResponse(), {
      message: 'Daily AI Tutor request quota exceeded',
      code: 'AI_TUTOR_DAILY_QUOTA_EXCEEDED',
      retryAfterSeconds: 12_345,
    });
    assert.equal(providerReached, false);
    assert.deepEqual(events, ['lock', 'operation', 'quota', 'release']);
    const logEvents = parseEvents(logs);
    assert.ok(
      logEvents.some(
        (event) => event.event === 'ai_tutor.request.rejected' && event.reason === 'daily_quota',
      ),
    );
    assert.ok(
      logEvents.some(
        (event) =>
          event.event === 'ai_tutor.request.completed' &&
          event.outcome === 'failure' &&
          event.quotaConsumed === false,
      ),
    );
  });

  test('does not consume quota without provider admission and releases after success and failure', async () => {
    let quotaCalls = 0;
    let releaseCalls = 0;
    const redisService = {
      acquireLock: async () => ({ acquired: true, ttlSeconds: 120 }),
      consumeDailyQuota: async () => {
        quotaCalls += 1;
        return { allowed: true, count: quotaCalls, ttlSeconds: 100 };
      },
      releaseLock: async () => {
        releaseCalls += 1;
        return true;
      },
    } as unknown as RedisService;
    const service = new AiTutorUsageService(redisService, usageConfig());
    const logs = captureLogger(service);

    assert.equal(
      await service.withConcurrencyProtection(STUDENT_ID, async () => 'safe-fallback'),
      'safe-fallback',
    );
    assert.equal(quotaCalls, 0);
    assert.equal(releaseCalls, 1);

    const providerFailure = new Error('PROVIDER_ERROR_PRIVATE_f4260');
    const error = await captureException(
      service.withConcurrencyProtection(STUDENT_ID, async (admit) => {
        await admit();
        throw providerFailure;
      }),
    );
    assert.equal(error, providerFailure);
    assert.equal(quotaCalls, 1);
    assert.equal(releaseCalls, 2);
    assert.equal(logs.join('\n').includes(providerFailure.message), false);
  });

  test('fails closed for concurrency and quota Redis failures in production', async (context) => {
    await context.test('lock acquisition failure', async () => {
      let operationReached = false;
      let releaseCalls = 0;
      const redisService = {
        acquireLock: async (
          _key: string,
          _token: string,
          _ttl: number,
          options?: { failClosed?: boolean },
        ) => {
          assert.equal(options?.failClosed, true);
          throw new ServiceUnavailableException('Security controls unavailable');
        },
        releaseLock: async () => {
          releaseCalls += 1;
          return true;
        },
      } as unknown as RedisService;
      const service = new AiTutorUsageService(redisService, usageConfig());

      const error = await captureException(
        service.withConcurrencyProtection(STUDENT_ID, async () => {
          operationReached = true;
          return 'unreachable';
        }),
      );
      expectHttpStatus(error, HttpStatus.SERVICE_UNAVAILABLE);
      assert.equal(operationReached, false);
      assert.equal(releaseCalls, 0);
    });

    await context.test('daily quota failure', async () => {
      let providerReached = false;
      let releaseCalls = 0;
      const redisService = {
        acquireLock: async () => ({ acquired: true, ttlSeconds: 120 }),
        consumeDailyQuota: async (
          _key: string,
          _max: number,
          options?: { failClosed?: boolean },
        ) => {
          assert.equal(options?.failClosed, true);
          throw new ServiceUnavailableException('Security controls unavailable');
        },
        releaseLock: async () => {
          releaseCalls += 1;
          return true;
        },
      } as unknown as RedisService;
      const service = new AiTutorUsageService(redisService, usageConfig());
      captureLogger(service);

      const error = await captureException(
        service.withConcurrencyProtection(STUDENT_ID, async (admit) => {
          await admit();
          providerReached = true;
          return 'unreachable';
        }),
      );
      expectHttpStatus(error, HttpStatus.SERVICE_UNAVAILABLE);
      assert.equal(providerReached, false);
      assert.equal(releaseCalls, 1);
    });
  });
});

describe('AI Tutor structured logging', () => {
  test('logs accepted/success/failure/duration/provider fields without AI or session content', async () => {
    const sensitiveValues = {
      prompt: 'PROMPT_PRIVATE_f0d7a',
      lesson: 'LESSON_PRIVATE_283aa',
      response: 'MODEL_RESPONSE_PRIVATE_a98ce',
      apiKey: 'API_KEY_PRIVATE_c7614',
      cookie: 'COOKIE_PRIVATE_806bf',
      session: 'SESSION_PRIVATE_168d2',
      providerError: 'PROVIDER_ERROR_PRIVATE_c03e1',
    };
    let generationCount = 0;
    let observedPrompt = '';
    let releaseCalls = 0;
    const configService = {
      ...usageConfig(),
      aiProviderPriority: 'local-first',
    } as AppConfigService;
    const redisService = {
      acquireLock: async () => ({ acquired: true, ttlSeconds: 120 }),
      consumeDailyQuota: async () => ({
        allowed: true,
        count: generationCount + 1,
        ttlSeconds: 10_000,
      }),
      releaseLock: async () => {
        releaseCalls += 1;
        return true;
      },
    } as unknown as RedisService;
    const usageService = new AiTutorUsageService(redisService, configService);
    const ollamaProvider = {
      name: 'ollama' as const,
      isEnabled: () => true,
      isHealthy: async () => true,
      generateText: async (prompt: string) => {
        generationCount += 1;
        observedPrompt = prompt;
        if (generationCount === 2) {
          throw new Error(sensitiveValues.providerError);
        }
        return `Educational answer ${sensitiveValues.response}`;
      },
    } as unknown as OllamaProvider;
    const geminiProvider = {
      name: 'gemini' as const,
      isEnabled: () => false,
      isHealthy: async () => false,
      generateText: async () => assert.fail('Disabled Gemini provider was invoked'),
    } as unknown as GeminiProvider;
    const safeMockProvider = {
      generate: () => ({
        type: 'explanation' as const,
        answer: 'A safe fallback answer',
        blocked: false,
        safetyLevel: 'safe' as const,
      }),
    } as unknown as SafeMockProvider;
    const aiTutorService = new AiTutorService(
      configService,
      new AiSafetyGuard(),
      ollamaProvider,
      geminiProvider,
      safeMockProvider,
      usageService,
    );
    const usageLogs = captureLogger(usageService);
    const providerLogs = captureLogger(aiTutorService);
    const request: AskAiTutorDto = {
      lessonTitle: 'Security foundations',
      lessonContent: [
        'Explain a defensive security concept.',
        sensitiveValues.lesson,
        sensitiveValues.apiKey,
        sensitiveValues.cookie,
        sensitiveValues.session,
      ].join(' '),
      question: `Please explain this material. ${sensitiveValues.prompt}`,
    };

    const success = await aiTutorService.ask(request, STUDENT_ID);
    assert.equal(success.answer, `Educational answer ${sensitiveValues.response}`);
    assert.ok(observedPrompt.includes(sensitiveValues.prompt));
    assert.ok(observedPrompt.includes(sensitiveValues.lesson));

    const fallback = await aiTutorService.ask(request, STUDENT_ID);
    assert.equal(fallback.answer, 'A safe fallback answer');
    assert.equal(releaseCalls, 2);

    const allLogs = [...usageLogs, ...providerLogs];
    const events = parseEvents(allLogs);
    assert.ok(
      events.some(
        (event) => event.event === 'ai_tutor.provider.selected' && event.provider === 'ollama',
      ),
    );
    assert.ok(
      events.some(
        (event) =>
          event.event === 'ai_tutor.provider.success' &&
          event.provider === 'ollama' &&
          typeof event.durationMs === 'number',
      ),
    );
    assert.ok(
      events.some(
        (event) =>
          event.event === 'ai_tutor.provider.failure' &&
          event.provider === 'ollama' &&
          event.reason === 'bad_response' &&
          typeof event.durationMs === 'number',
      ),
    );
    assert.ok(events.some((event) => event.event === 'ai_tutor.request.accepted'));
    assert.ok(
      events.some(
        (event) =>
          event.event === 'ai_tutor.request.completed' && typeof event.durationMs === 'number',
      ),
    );

    const serializedLogs = allLogs.join('\n');
    for (const sensitiveValue of Object.values(sensitiveValues)) {
      assert.equal(serializedLogs.includes(sensitiveValue), false);
    }
  });
});
