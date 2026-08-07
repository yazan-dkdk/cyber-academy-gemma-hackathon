import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole, UserStatus } from '@prisma/client';
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { SessionRecord } from '../../session/session.types';
import { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import { AdminMfaGuard } from './admin-mfa.guard';
import { RolesGuard } from './roles.guard';

const adminUser: AuthenticatedUser = {
  id: '00000000-0000-4000-8000-000000000301',
  email: 'admin@example.test',
  role: UserRole.ADMIN,
  status: UserStatus.ACTIVE,
  sessionVersion: 1,
  adminMfaEnabled: true,
};

const adminSession: SessionRecord = {
  sessionId: 'admin-session-id',
  userId: adminUser.id,
  email: adminUser.email,
  role: adminUser.role,
  userStatus: adminUser.status,
  emailVerifiedAt: '2026-01-01T00:00:00.000Z',
  sessionVersion: adminUser.sessionVersion,
  adminMfaEnabled: adminUser.adminMfaEnabled,
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

function executionContext(user: AuthenticatedUser, session: SessionRecord) {
  const request = {
    auth: {
      sessionId: session.sessionId,
      session,
      user,
    },
  } as AuthenticatedRequest;

  return {
    getClass: () => class TestController {},
    getHandler: () => () => undefined,
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

function reflectorReturning(value: unknown) {
  return {
    getAllAndOverride: () => value,
  } as unknown as Reflector;
}

describe('RolesGuard', () => {
  test('allows a user whose role is required', () => {
    const guard = new RolesGuard(reflectorReturning([UserRole.ADMIN]));

    assert.equal(guard.canActivate(executionContext(adminUser, adminSession)), true);
  });

  test('forbids a user whose role is not required', () => {
    const student = {
      ...adminUser,
      role: UserRole.STUDENT,
    };
    const studentSession = {
      ...adminSession,
      role: UserRole.STUDENT,
    };
    const guard = new RolesGuard(reflectorReturning([UserRole.ADMIN]));

    assert.throws(
      () => guard.canActivate(executionContext(student, studentSession)),
      (error) =>
        error instanceof ForbiddenException && error.message === 'Insufficient role',
    );
  });
});

describe('AdminMfaGuard', () => {
  test('denies a password-only admin when MFA is required', () => {
    const guard = new AdminMfaGuard(reflectorReturning(true));

    assert.throws(
      () => guard.canActivate(executionContext(adminUser, adminSession)),
      (error) =>
        error instanceof ForbiddenException &&
        error.message === 'Admin MFA verification required',
    );
  });

  test('allows an MFA-authenticated admin through an MFA-required flow', () => {
    const mfaSession: SessionRecord = {
      ...adminSession,
      authLevel: 'MFA',
      adminMfaVerifiedAt: '2026-01-01T00:05:00.000Z',
    };
    const guard = new AdminMfaGuard(reflectorReturning(true));

    assert.equal(guard.canActivate(executionContext(adminUser, mfaSession)), true);
  });
});
