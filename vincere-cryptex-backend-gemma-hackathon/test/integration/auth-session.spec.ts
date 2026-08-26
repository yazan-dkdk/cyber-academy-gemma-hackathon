import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';

import { Prisma, PrismaClient, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';

import type { createApplication } from '../../src/application';
import type { EmailService } from '../../src/auth/email.service';
import {
  IntegrationEnvironment,
  validateIntegrationEnvironment,
} from '../../scripts/integration/environment';
import {
  createVerifiedPrismaClient,
  createVerifiedRedisClient,
  IntegrationRedisClient,
} from '../../scripts/integration/targets';

const TEST_USER_AGENT = 'pf05e-auth-integration/1.0';
const SESSION_COOKIE_NAME = 'pf05e_session';
const DEFAULT_PASSWORD = 'Integration-password-123!';
const NEW_PASSWORD = 'Integration-new-password-456!';
const GENERIC_LOGIN_ERROR = 'Invalid email or password';

type VerificationDelivery = Parameters<EmailService['sendEmailVerification']>[0];
type PasswordResetDelivery = Parameters<EmailService['sendPasswordResetEmail']>[0];

const verificationDeliveries: VerificationDelivery[] = [];
const passwordResetDeliveries: PasswordResetDelivery[] = [];

let environment: IntegrationEnvironment;
let prisma: PrismaClient;
let redis: IntegrationRedisClient;
let app: Awaited<ReturnType<typeof createApplication>>;
let originalFetch: typeof globalThis.fetch;
let externalHttpAttempts = 0;

type ApplicationFactory = typeof createApplication;
type EmailServiceClass = typeof EmailService;

const sha256 = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex');

const responseJson = (response: { json(): unknown }): Record<string, unknown> =>
  response.json() as Record<string, unknown>;

const errorMessage = (response: { json(): unknown }): unknown => {
  const body = responseJson(response);
  const error = body.error;
  return typeof error === 'object' && error !== null && 'message' in error
    ? (error as { message: unknown }).message
    : undefined;
};

const assertPublicResponseIsSanitized = (
  response: { body: string },
  secrets: Array<string | null | undefined> = [],
): void => {
  for (const field of [
    'passwordHash',
    'tokenHash',
    'sessionId',
    'secretCiphertext',
    'secretIv',
    'secretTag',
    'stack',
  ]) {
    assert.equal(response.body.includes(`"${field}"`), false, `response exposed ${field}`);
  }

  for (const secret of secrets) {
    if (secret) {
      assert.equal(response.body.includes(secret), false, 'response exposed a one-time secret');
    }
  }
};

const inject = (
  method: 'GET' | 'POST',
  url: string,
  options: { payload?: Record<string, unknown>; cookie?: string } = {},
) =>
  app.inject({
    method,
    url,
    headers: {
      'user-agent': TEST_USER_AGENT,
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    ...(options.payload === undefined ? {} : { payload: options.payload }),
  });

const findDelivery = <T extends { to: string }>(deliveries: T[], email: string): T => {
  const delivery = [...deliveries].reverse().find((candidate) => candidate.to === email);
  assert.ok(delivery, `expected a captured delivery for ${email}`);
  return delivery;
};

const getSetCookie = (response: { headers: Record<string, unknown> }): string => {
  const header = response.headers['set-cookie'];
  const value = Array.isArray(header) ? header[0] : header;
  assert.equal(typeof value, 'string', 'response did not set a cookie');
  return value as string;
};

const parseSignedSessionCookie = (setCookie: string) => {
  const cookiePair = setCookie.split(';', 1)[0]!;
  const expectedPrefix = `${SESSION_COOKIE_NAME}=`;
  assert.ok(cookiePair.startsWith(expectedPrefix));

  const signedValue = decodeURIComponent(cookiePair.slice(expectedPrefix.length));
  const fastify = app.getHttpAdapter().getInstance();
  const unsigned = fastify.unsignCookie(signedValue);

  assert.equal(unsigned.valid, true, 'session cookie signature was not valid');
  assert.equal(typeof unsigned.value, 'string');
  assert.notEqual(signedValue, unsigned.value, 'session cookie was not signed');

  return {
    cookiePair,
    sessionId: unsigned.value as string,
    signedValue,
  };
};

const registerAndVerifyStudent = async (email: string, password = DEFAULT_PASSWORD) => {
  const deliveryCount = verificationDeliveries.length;
  const registration = await inject('POST', '/api/auth/register', {
    payload: { email, password },
  });
  assert.equal(registration.statusCode, 201);
  assert.equal(verificationDeliveries.length, deliveryCount + 1);

  const delivery = findDelivery(verificationDeliveries, email);
  const verification = await inject('POST', '/api/auth/verify-email', {
    payload: { token: delivery.token },
  });
  assert.equal(verification.statusCode, 200);

  const user = await prisma.user.findUnique({ where: { email } });
  assert.ok(user);
  assert.equal(user.status, UserStatus.ACTIVE);
  assert.ok(user.emailVerifiedAt);

  return { delivery, registration, user };
};

const loginWithSession = async (email: string, password = DEFAULT_PASSWORD) => {
  const response = await inject('POST', '/api/auth/login', {
    payload: { email, password },
  });
  assert.equal(response.statusCode, 200);
  const cookie = parseSignedSessionCookie(getSetCookie(response));
  assertPublicResponseIsSanitized(response, [cookie.sessionId]);
  return { cookie, response };
};

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

const cleanupAuthRedisState = async (): Promise<void> =>
  deleteRedisKeys([
    'session:*',
    'user-auth-state:*',
    'rate-limit:login:*',
    'rate-limit:register:*',
    'rate-limit:resend-verification:*',
    'rate-limit:forgot-password:*',
    'rate-limit:reset-password:*',
    'rate-limit:mfa:*',
    'mfa:failures:*',
    'mfa:lock:*',
  ]);

const assertPersistedStateChangeInvalidatesSession = async (
  email: string,
  data: Prisma.UserUpdateInput,
): Promise<void> => {
  const { user } = await registerAndVerifyStudent(email);
  const { cookie } = await loginWithSession(email);

  assert.ok(await redis.get(`session:${cookie.sessionId}`));
  await prisma.user.update({ where: { id: user.id }, data });
  await redis.del(`user-auth-state:${user.id}`);

  const rejected = await inject('GET', '/api/auth/me', { cookie: cookie.cookiePair });
  assert.equal(rejected.statusCode, 401);
  assert.equal(await redis.get(`session:${cookie.sessionId}`), null);
  assertPublicResponseIsSanitized(rejected, [cookie.sessionId]);
};

describe('authentication and Redis-backed session integration', () => {
  before(async () => {
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
    await cleanupAuthRedisState();

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
    emailService.sendEmailVerification = async (input) => {
      verificationDeliveries.push({ ...input, expiresAt: new Date(input.expiresAt) });
    };
    emailService.sendPasswordResetEmail = async (input) => {
      passwordResetDeliveries.push({ ...input, expiresAt: new Date(input.expiresAt) });
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
        await cleanupAuthRedisState();
      }
      assert.equal(externalHttpAttempts, 0, 'an external HTTP call was attempted');
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

  it('enforces registration, validation, non-enumeration, and one-time email verification', async () => {
    const email = 'pf05e-registration@example.invalid';
    const firstDeliveryCount = verificationDeliveries.length;
    const firstRegistration = await inject('POST', '/api/auth/register', {
      payload: { email: email.toUpperCase(), password: DEFAULT_PASSWORD },
    });

    assert.equal(firstRegistration.statusCode, 201);
    assert.equal(verificationDeliveries.length, firstDeliveryCount + 1);
    const genericRegistrationBody = responseJson(firstRegistration);
    const user = await prisma.user.findUnique({ where: { email } });
    assert.ok(user);
    assert.equal(user.role, UserRole.STUDENT);
    assert.equal(user.status, UserStatus.PENDING_EMAIL_VERIFICATION);
    assert.notEqual(user.passwordHash, DEFAULT_PASSWORD);
    assert.equal(await bcrypt.compare(DEFAULT_PASSWORD, user.passwordHash), true);

    const firstDelivery = findDelivery(verificationDeliveries, email);
    const firstTokenRecord = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash: sha256(firstDelivery.token) },
    });
    assert.ok(firstTokenRecord);
    assert.notEqual(firstTokenRecord.tokenHash, firstDelivery.token);
    assert.equal(firstTokenRecord.usedAt, null);
    assertPublicResponseIsSanitized(firstRegistration, [firstDelivery.token]);

    const preVerificationLogin = await inject('POST', '/api/auth/login', {
      payload: { email, password: DEFAULT_PASSWORD },
    });
    assert.equal(preVerificationLogin.statusCode, 401);
    assert.equal(errorMessage(preVerificationLogin), GENERIC_LOGIN_ERROR);

    const duplicateRegistration = await inject('POST', '/api/auth/register', {
      payload: { email, password: 'Different-password-789!' },
    });
    assert.equal(duplicateRegistration.statusCode, 201);
    assert.deepEqual(responseJson(duplicateRegistration), genericRegistrationBody);
    const secondDelivery = findDelivery(verificationDeliveries, email);
    assert.notEqual(secondDelivery.token, firstDelivery.token);

    const firstTokenAfterReissue = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash: sha256(firstDelivery.token) },
    });
    const secondTokenRecord = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash: sha256(secondDelivery.token) },
    });
    assert.ok(firstTokenAfterReissue?.usedAt);
    assert.equal(secondTokenRecord?.usedAt, null);

    const invalidEmail = 'pf05e-invalid-dto@example.invalid';
    const invalidRegistration = await inject('POST', '/api/auth/register', {
      payload: { email: invalidEmail, password: 'short', unexpected: true },
    });
    assert.equal(invalidRegistration.statusCode, 400);
    assert.equal(await prisma.user.count({ where: { email: invalidEmail } }), 0);
    assertPublicResponseIsSanitized(invalidRegistration);

    const verification = await inject('POST', '/api/auth/verify-email', {
      payload: { token: secondDelivery.token },
    });
    assert.equal(verification.statusCode, 200);
    const verifiedUser = await prisma.user.findUnique({ where: { email } });
    assert.equal(verifiedUser?.status, UserStatus.ACTIVE);
    assert.ok(verifiedUser?.emailVerifiedAt);
    assert.ok(
      (
        await prisma.emailVerificationToken.findUnique({
          where: { tokenHash: sha256(secondDelivery.token) },
        })
      )?.usedAt,
    );
    assertPublicResponseIsSanitized(verification, [secondDelivery.token]);

    const tokenReuse = await inject('POST', '/api/auth/verify-email', {
      payload: { token: secondDelivery.token },
    });
    assert.equal(tokenReuse.statusCode, 400);
    assert.equal(errorMessage(tokenReuse), 'Invalid or expired verification token');
    assertPublicResponseIsSanitized(tokenReuse, [secondDelivery.token]);

    const deliveriesBeforeActiveDuplicate = verificationDeliveries.length;
    const activeDuplicate = await inject('POST', '/api/auth/register', {
      payload: { email, password: 'Another-password-987!' },
    });
    assert.equal(activeDuplicate.statusCode, 201);
    assert.deepEqual(responseJson(activeDuplicate), genericRegistrationBody);
    assert.equal(verificationDeliveries.length, deliveriesBeforeActiveDuplicate);
  });

  it('keeps wrong-password and unknown-account login failures indistinguishable', async () => {
    const email = 'pf05e-login-contract@example.invalid';
    await registerAndVerifyStudent(email);

    const wrongPassword = await inject('POST', '/api/auth/login', {
      payload: { email, password: 'Wrong-password-123!' },
    });
    const unknownAccount = await inject('POST', '/api/auth/login', {
      payload: {
        email: 'pf05e-login-unknown@example.invalid',
        password: 'Wrong-password-123!',
      },
    });

    assert.equal(wrongPassword.statusCode, 401);
    assert.equal(unknownAccount.statusCode, 401);
    assert.equal(errorMessage(wrongPassword), GENERIC_LOGIN_ERROR);
    assert.equal(errorMessage(unknownAccount), GENERIC_LOGIN_ERROR);
    assertPublicResponseIsSanitized(wrongPassword);
    assertPublicResponseIsSanitized(unknownAccount);
  });

  it('creates a signed cookie and real Redis session accepted by the protected API boundary', async () => {
    const email = 'pf05e-session@example.invalid';
    const { user } = await registerAndVerifyStudent(email);
    const { cookie, response: loginResponse } = await loginWithSession(email);
    const setCookie = getSetCookie(loginResponse);

    assert.match(setCookie, /;\s*HttpOnly/i);
    assert.match(setCookie, /;\s*SameSite=Lax/i);
    assert.match(setCookie, /;\s*Path=\//i);
    assert.doesNotMatch(setCookie, /;\s*Secure/i);

    const storedSession = JSON.parse(
      (await redis.get(`session:${cookie.sessionId}`)) ?? 'null',
    ) as Record<string, unknown> | null;
    assert.ok(storedSession);
    assert.equal(storedSession.userId, user.id);
    assert.equal(storedSession.sessionId, cookie.sessionId);

    const authenticated = await inject('GET', '/api/auth/me', {
      cookie: cookie.cookiePair,
    });
    assert.equal(authenticated.statusCode, 200);
    assert.equal((responseJson(authenticated).user as { email: string }).email, email);
    assertPublicResponseIsSanitized(authenticated, [cookie.sessionId]);

    const noCookie = await inject('GET', '/api/auth/me');
    const invalidCookie = await inject('GET', '/api/auth/me', {
      cookie: `${SESSION_COOKIE_NAME}=random-invalid-cookie`,
    });
    assert.equal(noCookie.statusCode, 401);
    assert.equal(invalidCookie.statusCode, 401);
    assertPublicResponseIsSanitized(noCookie);
    assertPublicResponseIsSanitized(invalidCookie);

    await redis.del(`session:${cookie.sessionId}`);
    const removedServerSession = await inject('GET', '/api/auth/me', {
      cookie: cookie.cookiePair,
    });
    assert.equal(removedServerSession.statusCode, 401);
    assertPublicResponseIsSanitized(removedServerSession, [cookie.sessionId]);
  });

  it('logout removes the Redis session, expires the browser cookie, and prevents reuse', async () => {
    const email = 'pf05e-logout@example.invalid';
    await registerAndVerifyStudent(email);
    const { cookie } = await loginWithSession(email);
    assert.ok(await redis.get(`session:${cookie.sessionId}`));

    const logout = await inject('POST', '/api/auth/logout', { cookie: cookie.cookiePair });
    assert.equal(logout.statusCode, 200);
    assert.equal(await redis.get(`session:${cookie.sessionId}`), null);
    const clearedCookie = getSetCookie(logout);
    assert.match(clearedCookie, new RegExp(`^${SESSION_COOKIE_NAME}=`));
    assert.match(clearedCookie, /;\s*Path=\//i);
    assert.match(clearedCookie, /;\s*HttpOnly/i);
    assert.match(clearedCookie, /;\s*SameSite=Lax/i);
    assert.match(clearedCookie, /(?:Max-Age=0|Expires=Thu, 01 Jan 1970)/i);

    const reused = await inject('GET', '/api/auth/me', { cookie: cookie.cookiePair });
    assert.equal(reused.statusCode, 401);
    assertPublicResponseIsSanitized(logout, [cookie.sessionId]);
    assertPublicResponseIsSanitized(reused, [cookie.sessionId]);
  });

  it('invalidates existing sessions after session-version, suspension, or ban changes', async () => {
    await assertPersistedStateChangeInvalidatesSession(
      'pf05e-version-change@example.invalid',
      { sessionVersion: { increment: 1 } },
    );
    await assertPersistedStateChangeInvalidatesSession('pf05e-suspended@example.invalid', {
      status: UserStatus.SUSPENDED,
    });
    await assertPersistedStateChangeInvalidatesSession('pf05e-banned@example.invalid', {
      status: UserStatus.BANNED,
    });
  });

  it('uses one-time hashed reset tokens, rotates credentials, and invalidates old sessions', async () => {
    const email = 'pf05e-password-reset@example.invalid';
    const unknownEmail = 'pf05e-password-reset-unknown@example.invalid';
    const { user } = await registerAndVerifyStudent(email);
    const { cookie: oldCookie } = await loginWithSession(email);
    const beforeReset = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });

    const deliveryCount = passwordResetDeliveries.length;
    const knownForgot = await inject('POST', '/api/auth/forgot-password', {
      payload: { email },
    });
    const unknownForgot = await inject('POST', '/api/auth/forgot-password', {
      payload: { email: unknownEmail },
    });
    assert.equal(knownForgot.statusCode, 201);
    assert.equal(unknownForgot.statusCode, 201);
    assert.deepEqual(responseJson(knownForgot), responseJson(unknownForgot));
    assert.equal(passwordResetDeliveries.length, deliveryCount + 1);

    const delivery = findDelivery(passwordResetDeliveries, email);
    const tokenRecord = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256(delivery.token) },
    });
    assert.ok(tokenRecord);
    assert.notEqual(tokenRecord.tokenHash, delivery.token);
    assert.equal(tokenRecord.usedAt, null);
    assertPublicResponseIsSanitized(knownForgot, [delivery.token]);
    assertPublicResponseIsSanitized(unknownForgot, [delivery.token]);

    const reset = await inject('POST', '/api/auth/reset-password', {
      payload: { token: delivery.token, password: NEW_PASSWORD },
    });
    assert.equal(reset.statusCode, 201);
    const afterReset = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const consumedToken = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256(delivery.token) },
    });
    assert.notEqual(afterReset.passwordHash, beforeReset.passwordHash);
    assert.equal(afterReset.sessionVersion, beforeReset.sessionVersion + 1);
    assert.equal(await bcrypt.compare(DEFAULT_PASSWORD, afterReset.passwordHash), false);
    assert.equal(await bcrypt.compare(NEW_PASSWORD, afterReset.passwordHash), true);
    assert.ok(consumedToken?.usedAt);
    assertPublicResponseIsSanitized(reset, [delivery.token]);

    const reusedToken = await inject('POST', '/api/auth/reset-password', {
      payload: { token: delivery.token, password: 'Unused-password-789!' },
    });
    assert.equal(reusedToken.statusCode, 400);
    assert.equal(errorMessage(reusedToken), 'Invalid or expired reset token');
    assertPublicResponseIsSanitized(reusedToken, [delivery.token]);

    const oldPasswordLogin = await inject('POST', '/api/auth/login', {
      payload: { email, password: DEFAULT_PASSWORD },
    });
    assert.equal(oldPasswordLogin.statusCode, 401);
    const newPasswordLogin = await loginWithSession(email, NEW_PASSWORD);
    assert.equal(newPasswordLogin.response.statusCode, 200);

    assert.ok(await redis.get(`session:${oldCookie.sessionId}`));
    const oldSessionAfterReset = await inject('GET', '/api/auth/me', {
      cookie: oldCookie.cookiePair,
    });
    assert.equal(oldSessionAfterReset.statusCode, 401);
    assert.equal(await redis.get(`session:${oldCookie.sessionId}`), null);
    assertPublicResponseIsSanitized(oldPasswordLogin);
    assertPublicResponseIsSanitized(oldSessionAfterReset, [oldCookie.sessionId]);
  });

  it('enforces student RBAC and requires then satisfies admin MFA at the same endpoint', async () => {
    const studentEmail = 'pf05e-rbac-student@example.invalid';
    await registerAndVerifyStudent(studentEmail);
    const { cookie: studentCookie } = await loginWithSession(studentEmail);
    const studentDenied = await inject('GET', '/api/users', {
      cookie: studentCookie.cookiePair,
    });
    assert.equal(studentDenied.statusCode, 403);
    assertPublicResponseIsSanitized(studentDenied, [studentCookie.sessionId]);

    const adminEmail = 'pf05e-mfa-admin@example.invalid';
    const adminPasswordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);
    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash: adminPasswordHash,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      },
    });
    const { cookie: passwordOnlyCookie, response: adminLogin } = await loginWithSession(adminEmail);
    const adminLoginBody = responseJson(adminLogin);
    assert.equal(adminLoginBody.mfaRequired, true);
    assert.equal(adminLoginBody.mfaVerified, false);

    const passwordOnlyDenied = await inject('GET', '/api/users', {
      cookie: passwordOnlyCookie.cookiePair,
    });
    assert.equal(passwordOnlyDenied.statusCode, 403);
    assert.equal(errorMessage(passwordOnlyDenied), 'Admin MFA verification required');

    const setup = await inject('POST', '/api/auth/admin-mfa/setup', {
      cookie: passwordOnlyCookie.cookiePair,
    });
    assert.equal(setup.statusCode, 201);
    const setupBody = responseJson(setup) as {
      manualEntryKey: string;
      otpauthUrl: string;
    };
    assert.match(setupBody.otpauthUrl, /^otpauth:\/\/totp\//);
    assert.ok(setupBody.manualEntryKey.length > 0);
    const storedMfa = await prisma.adminMfaConfig.findUniqueOrThrow({
      where: { userId: admin.id },
    });
    assert.equal(storedMfa.isEnabled, false);
    assert.notEqual(storedMfa.secretCiphertext, setupBody.manualEntryKey);
    assert.equal(storedMfa.secretCiphertext.includes(setupBody.manualEntryKey), false);

    const code = authenticator.generate(setupBody.manualEntryKey);
    const verification = await inject('POST', '/api/auth/admin-mfa/verify', {
      cookie: passwordOnlyCookie.cookiePair,
      payload: { code },
    });
    assert.equal(verification.statusCode, 201);
    const mfaCookie = parseSignedSessionCookie(getSetCookie(verification));
    assert.notEqual(mfaCookie.sessionId, passwordOnlyCookie.sessionId);
    assert.equal(await redis.get(`session:${passwordOnlyCookie.sessionId}`), null);
    assert.ok(await redis.get(`session:${mfaCookie.sessionId}`));
    const enabledMfa = await prisma.adminMfaConfig.findUniqueOrThrow({
      where: { userId: admin.id },
    });
    assert.equal(enabledMfa.isEnabled, true);

    const oldAdminSessionDenied = await inject('GET', '/api/users', {
      cookie: passwordOnlyCookie.cookiePair,
    });
    assert.equal(oldAdminSessionDenied.statusCode, 401);
    const mfaAdminAllowed = await inject('GET', '/api/users', {
      cookie: mfaCookie.cookiePair,
    });
    assert.equal(mfaAdminAllowed.statusCode, 200);
    assertPublicResponseIsSanitized(passwordOnlyDenied, [passwordOnlyCookie.sessionId]);
    assertPublicResponseIsSanitized(oldAdminSessionDenied, [passwordOnlyCookie.sessionId]);
    assertPublicResponseIsSanitized(mfaAdminAllowed, [mfaCookie.sessionId]);
  });
});
