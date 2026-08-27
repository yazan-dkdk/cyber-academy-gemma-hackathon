import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';

import {
  ActivityType,
  ChallengeDifficulty,
  ChallengeStatus,
  PrismaClient,
  UserRole,
  UserStatus,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

import type { createApplication } from '../../src/application';
import type { EmailService } from '../../src/auth/email.service';
import {
  buildIntegrationTestProcessEnvironment,
  IntegrationEnvironment,
  validateIntegrationEnvironment,
} from '../../scripts/integration/environment';
import {
  createVerifiedPrismaClient,
  createVerifiedRedisClient,
  IntegrationRedisClient,
} from '../../scripts/integration/targets';

const TEST_USER_AGENT = 'pf05f1-challenge-integration/1.0';
const DEFAULT_PASSWORD = 'Integration-password-123!';
const SESSION_COOKIE_NAME = 'pf05e_session';
const CHALLENGE_POINTS = 125;

interface SubmissionResponse {
  correct: boolean;
  alreadySolved: boolean;
  pointsAwarded: number;
  attemptsCount: number;
  solvedAt: string | null;
  message: string;
}

type ApplicationFactory = typeof createApplication;
type EmailServiceClass = typeof EmailService;

let environment: IntegrationEnvironment;
let prisma: PrismaClient;
let redis: IntegrationRedisClient;
let app: Awaited<ReturnType<typeof createApplication>>;
let passwordHash: string;
let originalFetch: typeof globalThis.fetch;
let externalHttpAttempts = 0;
let emailDeliveryAttempts = 0;

const sha256 = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex');

const submissionJson = (response: { json(): unknown }): SubmissionResponse =>
  response.json() as SubmissionResponse;

const assertNoInternalErrorExposure = (
  response: { body: string },
  secrets: string[] = [],
): void => {
  for (const forbidden of [
    'P2002',
    'Prisma',
    'PrismaClient',
    'Unique constraint',
    'flagHash',
    'submittedFlagHash',
    'passwordHash',
    'stack',
  ]) {
    assert.equal(response.body.includes(forbidden), false, `response exposed ${forbidden}`);
  }

  for (const secret of secrets) {
    assert.equal(response.body.includes(secret), false, 'response exposed a submitted flag');
  }
};

const getCookiePair = (response: { headers: Record<string, unknown> }): string => {
  const header = response.headers['set-cookie'];
  const value = Array.isArray(header) ? header[0] : header;
  assert.equal(typeof value, 'string', 'login response did not set a session cookie');

  const cookiePair = (value as string).split(';', 1)[0]!;
  assert.ok(cookiePair.startsWith(`${SESSION_COOKIE_NAME}=`));
  return cookiePair;
};

const inject = (
  url: string,
  options: { payload?: Record<string, unknown>; cookie?: string } = {},
) =>
  app.inject({
    method: 'POST',
    url,
    headers: {
      'user-agent': TEST_USER_AGENT,
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    ...(options.payload === undefined ? {} : { payload: options.payload }),
  });

const deleteRedisKeys = async (patterns: string[]): Promise<void> => {
  for (const pattern of patterns) {
    const keys: string[] = [];
    for await (const key of redis.scanIterator({ MATCH: pattern, COUNT: 100 })) {
      keys.push(key);
    }

    if (keys.length > 0) {
      await redis.del(keys);
    }
  }
};

const cleanupChallengeRedisState = async (): Promise<void> =>
  deleteRedisKeys([
    'session:*',
    'user-auth-state:*',
    'rate-limit:login:*',
    'rate-limit:flag:*',
  ]);

const createStudentSession = async (email: string) => {
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      role: UserRole.STUDENT,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
    },
  });
  const login = await inject('/api/auth/login', {
    payload: { email, password: DEFAULT_PASSWORD },
  });

  assert.equal(login.statusCode, 200);
  assertNoInternalErrorExposure(login);
  return { cookie: getCookiePair(login), user };
};

const createPublishedChallenge = async (name: string, flag: string) =>
  prisma.challenge.create({
    data: {
      title: `PF-05F1 ${name}`,
      slug: `pf05f1-${name}`,
      description: 'PF-05F1 isolated integration fixture',
      category: 'integration',
      difficulty: ChallengeDifficulty.EASY,
      points: CHALLENGE_POINTS,
      status: ChallengeStatus.PUBLISHED,
      flagHash: sha256(flag),
      publishedAt: new Date(),
      hints: {
        create: [
          { position: 1, title: 'First hint', content: 'Integration fixture hint one' },
          { position: 2, title: 'Second hint', content: 'Integration fixture hint two' },
        ],
      },
    },
  });

const submitFlag = (cookie: string, challengeId: string, flag: string) =>
  inject(`/api/challenges/${challengeId}/flag-submissions`, {
    cookie,
    payload: { flag },
  });

describe('atomic and idempotent challenge completion integration', () => {
  before(async () => {
    Object.assign(process.env, buildIntegrationTestProcessEnvironment(process.env));
    environment = validateIntegrationEnvironment(process.env);
    assert.equal(process.env.OLLAMA_ENABLED, 'false');
    assert.equal(process.env.GEMINI_ENABLED, 'false');
    assert.equal(process.env.MAIL_HOST, '');
    assert.equal(process.env.RESEND_API_KEY, '');

    originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      externalHttpAttempts += 1;
      throw new Error('External HTTP is forbidden during integration tests');
    }) as typeof globalThis.fetch;

    prisma = await createVerifiedPrismaClient(environment);
    redis = await createVerifiedRedisClient(environment);
    await cleanupChallengeRedisState();
    passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 4);

    const compiledApplicationUrl = pathToFileURL(
      path.join(__dirname, '..', '..', 'dist', 'application.js'),
    ).href;
    const compiledEmailUrl = pathToFileURL(
      path.join(__dirname, '..', '..', 'dist', 'auth', 'email.service.js'),
    ).href;
    const compiledApplicationModule = (await import(compiledApplicationUrl)) as {
      createApplication: ApplicationFactory;
    };
    const compiledEmailModule = (await import(compiledEmailUrl)) as {
      EmailService: EmailServiceClass;
    };

    app = await compiledApplicationModule.createApplication();
    app.useLogger(false);

    const emailService = app.get(compiledEmailModule.EmailService);
    emailService.sendEmailVerification = async () => {
      emailDeliveryAttempts += 1;
      throw new Error('Email delivery is forbidden during challenge integration tests');
    };
    emailService.sendPasswordResetEmail = async () => {
      emailDeliveryAttempts += 1;
      throw new Error('Email delivery is forbidden during challenge integration tests');
    };

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  after(async () => {
    try {
      if (app) {
        await app.close();
      }
      if (redis?.isOpen) {
        await cleanupChallengeRedisState();
      }
      assert.equal(externalHttpAttempts, 0, 'an external HTTP call was attempted');
      assert.equal(emailDeliveryAttempts, 0, 'an email delivery was attempted');
    } finally {
      globalThis.fetch = originalFetch;
      if (prisma) {
        await prisma.$disconnect();
      }
      if (redis?.isOpen) {
        await redis.quit();
      }
    }
  });

  it('persists ten simultaneous correct attempts while acquiring exactly one completion', async () => {
    const correctFlag = 'PF05F1{atomic-concurrent-completion}';
    const { cookie, user } = await createStudentSession(
      'pf05f1-concurrent@example.invalid',
    );
    const challenge = await createPublishedChallenge('concurrent', correctFlag);

    const responses = await Promise.all(
      Array.from({ length: 10 }, () => submitFlag(cookie, challenge.id, correctFlag)),
    );

    for (const response of responses) {
      assert.equal(response.statusCode, 201);
      assertNoInternalErrorExposure(response, [correctFlag]);
    }

    const bodies = responses.map(submissionJson);
    assert.equal(bodies.every((body) => body.correct), true);
    assert.equal(bodies.filter((body) => !body.alreadySolved).length, 1);
    assert.equal(bodies.filter((body) => body.alreadySolved).length, 9);
    assert.equal(
      bodies.filter((body) => !body.alreadySolved && body.pointsAwarded === CHALLENGE_POINTS)
        .length,
      1,
    );
    assert.equal(
      bodies.filter((body) => body.alreadySolved && body.pointsAwarded === 0).length,
      9,
    );
    assert.equal(bodies.every((body) => typeof body.solvedAt === 'string'), true);
    assert.equal(new Set(bodies.map((body) => body.solvedAt)).size, 1);
    assert.equal(
      bodies.every(
        (body) =>
          Number.isInteger(body.attemptsCount) &&
          body.attemptsCount >= 1 &&
          body.attemptsCount <= 10,
      ),
      true,
    );

    const completions = await prisma.challengeCompletion.findMany({
      where: { challengeId: challenge.id, userId: user.id },
    });
    const attempts = await prisma.challengeAttempt.findMany({
      where: { challengeId: challenge.id, userId: user.id },
      orderBy: { createdAt: 'asc' },
    });
    const attemptActivities = await prisma.activityLog.findMany({
      where: {
        userId: user.id,
        entityId: challenge.id,
        activityType: ActivityType.CHALLENGE_ATTEMPT,
      },
    });
    const solveActivities = await prisma.activityLog.findMany({
      where: {
        userId: user.id,
        entityId: challenge.id,
        activityType: ActivityType.CHALLENGE_SOLVED,
      },
    });

    assert.equal(completions.length, 1);
    assert.equal(completions[0]!.pointsAwarded, CHALLENGE_POINTS);
    assert.equal(attempts.length, 10);
    assert.equal(attempts.every((attempt) => attempt.isCorrect), true);
    assert.equal(attempts.filter((attempt) => !attempt.alreadySolved).length, 1);
    assert.equal(attempts.filter((attempt) => attempt.alreadySolved).length, 9);
    assert.equal(
      completions[0]!.firstCorrectAttemptId,
      attempts.find((attempt) => !attempt.alreadySolved)?.id,
    );
    assert.equal(attemptActivities.length, 10);
    assert.equal(solveActivities.length, 1);
    assert.deepEqual(solveActivities[0]!.metadata, {
      attemptId: completions[0]!.firstCorrectAttemptId,
      pointsAwarded: CHALLENGE_POINTS,
    });
  });

  it('keeps repeated sequential correct submissions idempotent', async () => {
    const correctFlag = 'PF05F1{sequential-idempotency}';
    const { cookie, user } = await createStudentSession(
      'pf05f1-sequential@example.invalid',
    );
    const challenge = await createPublishedChallenge('sequential', correctFlag);

    const first = await submitFlag(cookie, challenge.id, correctFlag);
    const repeated = await submitFlag(cookie, challenge.id, correctFlag);

    assert.equal(first.statusCode, 201);
    assert.equal(repeated.statusCode, 201);
    assert.deepEqual(submissionJson(first), {
      correct: true,
      alreadySolved: false,
      pointsAwarded: CHALLENGE_POINTS,
      attemptsCount: 1,
      solvedAt: submissionJson(first).solvedAt,
      message: `Correct flag. ${CHALLENGE_POINTS} points awarded.`,
    });
    assert.equal(typeof submissionJson(first).solvedAt, 'string');
    assert.deepEqual(submissionJson(repeated), {
      correct: true,
      alreadySolved: true,
      pointsAwarded: 0,
      attemptsCount: 2,
      solvedAt: submissionJson(first).solvedAt,
      message: 'Challenge already solved; submission recorded.',
    });
    assertNoInternalErrorExposure(first, [correctFlag]);
    assertNoInternalErrorExposure(repeated, [correctFlag]);

    assert.equal(
      await prisma.challengeCompletion.count({
        where: { challengeId: challenge.id, userId: user.id },
      }),
      1,
    );
    const attempts = await prisma.challengeAttempt.findMany({
      where: { challengeId: challenge.id, userId: user.id },
      orderBy: { createdAt: 'asc' },
    });
    assert.equal(attempts.length, 2);
    assert.deepEqual(
      attempts.map((attempt) => attempt.alreadySolved),
      [false, true],
    );
    assert.equal(
      await prisma.activityLog.count({
        where: {
          userId: user.id,
          entityId: challenge.id,
          activityType: ActivityType.CHALLENGE_ATTEMPT,
        },
      }),
      2,
    );
    assert.equal(
      await prisma.activityLog.count({
        where: {
          userId: user.id,
          entityId: challenge.id,
          activityType: ActivityType.CHALLENGE_SOLVED,
        },
      }),
      1,
    );
  });

  it('preserves the wrong-flag response and attempt-only persistence behavior', async () => {
    const correctFlag = 'PF05F1{wrong-flag-control}';
    const wrongFlag = 'PF05F1{wrong-flag-value}';
    const { cookie, user } = await createStudentSession('pf05f1-wrong@example.invalid');
    const challenge = await createPublishedChallenge('wrong', correctFlag);

    const response = await submitFlag(cookie, challenge.id, wrongFlag);

    assert.equal(response.statusCode, 201);
    assert.deepEqual(submissionJson(response), {
      correct: false,
      alreadySolved: false,
      pointsAwarded: 0,
      attemptsCount: 1,
      solvedAt: null,
      message: 'Incorrect flag. Try again.',
    });
    assertNoInternalErrorExposure(response, [correctFlag, wrongFlag]);
    assert.equal(
      await prisma.challengeCompletion.count({
        where: { challengeId: challenge.id, userId: user.id },
      }),
      0,
    );
    const attempt = await prisma.challengeAttempt.findFirstOrThrow({
      where: { challengeId: challenge.id, userId: user.id },
    });
    assert.equal(attempt.isCorrect, false);
    assert.equal(attempt.alreadySolved, false);
    assert.equal(attempt.submittedFlagHash, sha256(wrongFlag));
    assert.notEqual(attempt.submittedFlagHash, wrongFlag);
    assert.equal(
      await prisma.activityLog.count({
        where: {
          userId: user.id,
          entityId: challenge.id,
          activityType: ActivityType.CHALLENGE_ATTEMPT,
        },
      }),
      1,
    );
    assert.equal(
      await prisma.activityLog.count({
        where: {
          userId: user.id,
          entityId: challenge.id,
          activityType: ActivityType.CHALLENGE_SOLVED,
        },
      }),
      0,
    );
  });

  it('retains the ten-request challenge submission rate limit', async () => {
    const correctFlag = 'PF05F1{rate-limit-control}';
    const wrongFlag = 'PF05F1{rate-limit-wrong}';
    const { cookie, user } = await createStudentSession('pf05f1-rate@example.invalid');
    const challenge = await createPublishedChallenge('rate-limit', correctFlag);

    const allowed = [];
    for (let requestNumber = 0; requestNumber < 10; requestNumber += 1) {
      allowed.push(await submitFlag(cookie, challenge.id, wrongFlag));
    }
    const rejected = await submitFlag(cookie, challenge.id, wrongFlag);

    assert.equal(allowed.every((response) => response.statusCode === 201), true);
    assert.equal(rejected.statusCode, 429);
    assert.match(String(rejected.headers['retry-after']), /^\d+$/);
    assertNoInternalErrorExposure(rejected, [correctFlag, wrongFlag]);
    assert.equal(
      await prisma.challengeAttempt.count({
        where: { challengeId: challenge.id, userId: user.id },
      }),
      10,
    );
    assert.equal(
      await prisma.challengeCompletion.count({
        where: { challengeId: challenge.id, userId: user.id },
      }),
      0,
    );
    assert.equal(
      await prisma.activityLog.count({
        where: {
          userId: user.id,
          entityId: challenge.id,
          activityType: ActivityType.CHALLENGE_ATTEMPT,
        },
      }),
      10,
    );
    assert.equal(
      await prisma.activityLog.count({
        where: {
          userId: user.id,
          entityId: challenge.id,
          activityType: ActivityType.CHALLENGE_SOLVED,
        },
      }),
      0,
    );
  });
});
