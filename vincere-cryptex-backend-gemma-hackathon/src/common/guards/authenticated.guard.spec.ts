import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { AuthStateService } from '../../auth/auth-state.service';
import { SessionService } from '../../session/session.service';
import { SessionRecord, UserAuthState } from '../../session/session.types';
import { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';
import { AuthenticatedGuard } from './authenticated.guard';

const SESSION_ID = 'authenticated-guard-session';

const baseSession: SessionRecord = {
  sessionId: SESSION_ID,
  userId: '00000000-0000-4000-8000-000000000201',
  email: 'guard-user@example.test',
  role: UserRole.STUDENT,
  userStatus: UserStatus.ACTIVE,
  emailVerifiedAt: '2026-01-01T00:00:00.000Z',
  sessionVersion: 7,
  adminMfaEnabled: false,
  authLevel: 'MFA',
  adminMfaVerifiedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
  clientBinding: {
    ipHash: null,
    ipSubnetHash: null,
    userAgentHash: null,
  },
  createdAt: '2026-01-01T00:00:00.000Z',
  lastSeenAt: '2026-01-01T00:00:00.000Z',
};

const baseUser: UserAuthState = {
  userId: baseSession.userId,
  email: baseSession.email,
  role: baseSession.role,
  userStatus: baseSession.userStatus,
  emailVerifiedAt: baseSession.emailVerifiedAt,
  sessionVersion: baseSession.sessionVersion,
  adminMfaEnabled: baseSession.adminMfaEnabled,
  deletedAt: null,
};

function requestContext() {
  const request = {
    headers: {},
    ip: '198.51.100.20',
    method: 'GET',
    url: '/api/auth/me',
  } as AuthenticatedRequest;
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;

  return { context, request };
}

function createGuard(options: {
  sessionId?: string | null;
  session?: SessionRecord | null;
  user?: UserAuthState | null;
}) {
  const calls = {
    destroySession: 0,
    refreshSession: 0,
  };
  const session = options.session === undefined ? baseSession : options.session;
  const user = options.user === undefined ? baseUser : options.user;
  const sessionService = {
    extractSignedSessionId: () =>
      options.sessionId === undefined ? SESSION_ID : options.sessionId,
    getSession: async () => session,
    validateClientBinding: () => ({
      valid: true,
      nextBinding: baseSession.clientBinding,
    }),
    destroySession: async () => {
      calls.destroySession += 1;
    },
    refreshSession: async () => {
      calls.refreshSession += 1;
      return session;
    },
  } as unknown as SessionService;
  const authStateService = {
    getOrHydrateUserAuthState: async () => user,
    clearUserAuthState: async () => undefined,
  } as unknown as AuthStateService;
  const guard = new AuthenticatedGuard(authStateService, sessionService);

  Object.defineProperty(guard, 'logger', {
    configurable: true,
    value: {
      error: () => undefined,
      warn: () => undefined,
    },
  });

  return { calls, guard };
}

describe('AuthenticatedGuard', () => {
  test('rejects a request without a signed session', async () => {
    const { context } = requestContext();
    const { calls, guard } = createGuard({ sessionId: null });

    await assert.rejects(
      guard.canActivate(context),
      (error) =>
        error instanceof UnauthorizedException &&
        error.message === 'Authentication required',
    );
    assert.deepEqual(calls, { destroySession: 0, refreshSession: 0 });
  });

  test('rejects a signed session that is no longer stored', async () => {
    const { context } = requestContext();
    const { calls, guard } = createGuard({ session: null });

    await assert.rejects(
      guard.canActivate(context),
      (error) =>
        error instanceof UnauthorizedException && error.message === 'Session expired',
    );
    assert.deepEqual(calls, { destroySession: 0, refreshSession: 0 });
  });

  test('destroys and rejects a suspended-user session', async () => {
    const suspendedSession = {
      ...baseSession,
      userStatus: UserStatus.SUSPENDED,
    };
    const suspendedUser = {
      ...baseUser,
      userStatus: UserStatus.SUSPENDED,
    };
    const { context } = requestContext();
    const { calls, guard } = createGuard({
      session: suspendedSession,
      user: suspendedUser,
    });

    await assert.rejects(
      guard.canActivate(context),
      (error) =>
        error instanceof ForbiddenException && error.message === 'Account suspended',
    );
    assert.deepEqual(calls, { destroySession: 1, refreshSession: 0 });
  });

  test('destroys and rejects a banned-user session', async () => {
    const bannedSession = {
      ...baseSession,
      userStatus: UserStatus.BANNED,
    };
    const bannedUser = {
      ...baseUser,
      userStatus: UserStatus.BANNED,
    };
    const { context } = requestContext();
    const { calls, guard } = createGuard({
      session: bannedSession,
      user: bannedUser,
    });

    await assert.rejects(
      guard.canActivate(context),
      (error) =>
        error instanceof ForbiddenException && error.message === 'Account banned',
    );
    assert.deepEqual(calls, { destroySession: 1, refreshSession: 0 });
  });

  test('invalidates a session whose version no longer matches the user', async () => {
    const { context } = requestContext();
    const { calls, guard } = createGuard({
      user: {
        ...baseUser,
        sessionVersion: baseUser.sessionVersion + 1,
      },
    });

    await assert.rejects(
      guard.canActivate(context),
      (error) =>
        error instanceof UnauthorizedException &&
        error.message === 'Session is no longer valid',
    );
    assert.deepEqual(calls, { destroySession: 1, refreshSession: 0 });
  });
});
