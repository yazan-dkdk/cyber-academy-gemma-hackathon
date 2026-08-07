import { UnauthorizedException } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { AuditService } from '../audit/audit.service';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { SessionService } from '../session/session.service';
import { SessionRecord, UserAuthState } from '../session/session.types';
import { AuthStateService } from './auth-state.service';
import { AuthService } from './auth.service';
import { EmailService } from './email.service';
import { MfaAttemptService } from './mfa-attempt.service';

const CORRECT_PASSWORD = 'Correct-password-123!';
const PASSWORD_HASH = bcrypt.hashSync(CORRECT_PASSWORD, 4);
const USER_ID = '00000000-0000-4000-8000-000000000101';

type LoginUser = {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  status: UserStatus;
  emailVerifiedAt: Date | null;
  sessionVersion: number;
  deletedAt: Date | null;
  adminMfaConfig: { isEnabled: boolean } | null;
};

const activeUser: LoginUser = {
  id: USER_ID,
  email: 'student@example.test',
  passwordHash: PASSWORD_HASH,
  role: UserRole.STUDENT,
  status: UserStatus.ACTIVE,
  emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
  sessionVersion: 3,
  deletedAt: null,
  adminMfaConfig: null,
};

const userAuthState: UserAuthState = {
  userId: activeUser.id,
  email: activeUser.email,
  role: activeUser.role,
  userStatus: activeUser.status,
  emailVerifiedAt: activeUser.emailVerifiedAt!.toISOString(),
  sessionVersion: activeUser.sessionVersion,
  adminMfaEnabled: false,
  deletedAt: null,
};

const sessionRecord: SessionRecord = {
  sessionId: 'unit-session-id',
  userId: activeUser.id,
  email: activeUser.email,
  role: activeUser.role,
  userStatus: activeUser.status,
  emailVerifiedAt: activeUser.emailVerifiedAt!.toISOString(),
  sessionVersion: activeUser.sessionVersion,
  adminMfaEnabled: false,
  authLevel: 'MFA',
  adminMfaVerifiedAt: activeUser.emailVerifiedAt!.toISOString(),
  deletedAt: null,
  clientBinding: {
    ipHash: null,
    ipSubnetHash: null,
    userAgentHash: null,
  },
  createdAt: activeUser.emailVerifiedAt!.toISOString(),
  lastSeenAt: activeUser.emailVerifiedAt!.toISOString(),
};

function createAuthService(user: LoginUser | null) {
  const calls = {
    cacheUserAuthState: 0,
    createSession: 0,
    updateLastLogin: 0,
  };
  const prisma = {
    user: {
      findFirst: async () => user,
      update: async () => {
        calls.updateLastLogin += 1;
        return user;
      },
    },
  } as unknown as PrismaService;
  const sessionService = {
    createSession: async () => {
      calls.createSession += 1;
      return sessionRecord;
    },
  } as unknown as SessionService;
  const authStateService = {
    buildUserAuthState: () => userAuthState,
    cacheUserAuthState: async () => {
      calls.cacheUserAuthState += 1;
      return userAuthState;
    },
  } as unknown as AuthStateService;
  const service = new AuthService(
    prisma,
    sessionService,
    authStateService,
    { forgotPasswordMinDurationMs: 0 } as AppConfigService,
    {} as EmailService,
    {} as MfaAttemptService,
    {} as AuditService,
  );

  Object.defineProperty(service, 'logger', {
    configurable: true,
    value: { log: () => undefined },
  });

  return { calls, service };
}

async function captureLoginFailure(operation: Promise<unknown>) {
  try {
    await operation;
  } catch (error) {
    assert.ok(error instanceof UnauthorizedException);
    return {
      message: error.message,
      status: error.getStatus(),
    };
  }

  assert.fail('Expected login to fail');
}

describe('AuthService login decisions', () => {
  test('uses the same generic failure for a missing account and an incorrect password', async () => {
    const missingAccount = createAuthService(null);
    const wrongPassword = createAuthService(activeUser);

    const missingFailure = await captureLoginFailure(
      missingAccount.service.login(
        'missing@example.test',
        'wrong-password',
        {} as AuthenticatedRequest,
      ),
    );
    const wrongPasswordFailure = await captureLoginFailure(
      wrongPassword.service.login(
        activeUser.email,
        'wrong-password',
        {} as AuthenticatedRequest,
      ),
    );

    assert.deepEqual(missingFailure, wrongPasswordFailure);
    assert.deepEqual(missingFailure, {
      message: 'Invalid email or password',
      status: 401,
    });
    assert.equal(missingAccount.calls.createSession, 0);
    assert.equal(wrongPassword.calls.createSession, 0);
  });

  test('does not reveal an inactive account after valid password verification', async () => {
    const pendingUser: LoginUser = {
      ...activeUser,
      status: UserStatus.PENDING_EMAIL_VERIFICATION,
      emailVerifiedAt: null,
    };
    const { calls, service } = createAuthService(pendingUser);

    const failure = await captureLoginFailure(
      service.login(
        pendingUser.email,
        CORRECT_PASSWORD,
        {} as AuthenticatedRequest,
      ),
    );

    assert.deepEqual(failure, {
      message: 'Invalid email or password',
      status: 401,
    });
    assert.equal(calls.createSession, 0);
    assert.equal(calls.cacheUserAuthState, 0);
    assert.equal(calls.updateLastLogin, 0);
  });

  test('creates and caches a session only after a valid active-user password', async () => {
    const { calls, service } = createAuthService(activeUser);

    const result = await service.login(
      activeUser.email.toUpperCase(),
      CORRECT_PASSWORD,
      {} as AuthenticatedRequest,
    );

    assert.equal(result.session, sessionRecord);
    assert.equal(result.response.user.id, activeUser.id);
    assert.equal(result.response.user.email, activeUser.email);
    assert.equal(result.response.mfaRequired, false);
    assert.equal(result.response.mfaVerified, true);
    assert.deepEqual(calls, {
      cacheUserAuthState: 1,
      createSession: 1,
      updateLastLogin: 1,
    });
  });
});
