import { db } from '../../config/db.js';
import { Roles, UserStatuses } from '../../shared/constants/roles.js';
import { AppError } from '../../shared/errors/app-error.js';
import { normalizeEmail } from '../../shared/utils/validation.js';
import { AuditActions, auditService } from '../audit/audit.service.js';
import { sessionService } from '../auth/session.service.js';
import { usersRepository } from './users.repository.js';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const MAX_REASON_LENGTH = 500;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Admin accounts remain visible in listing/detail endpoints for oversight and auditing,
// but this module only allows mutation of student/instructor accounts.
const MODIFIABLE_ROLES = new Set([Roles.STUDENT, Roles.INSTRUCTOR]);
const REACTIVATABLE_STATUSES = new Set([UserStatuses.SUSPENDED, UserStatuses.BANNED]);

const sanitizeUser = (user) => ({
  id: user.id,
  email: user.email,
  role: user.role,
  status: user.status,
  emailVerifiedAt: user.email_verified_at,
  lastLoginAt: user.last_login_at,
  createdAt: user.created_at,
  updatedAt: user.updated_at
});

const parsePositiveInteger = (value, fallback, fieldName) => {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new AppError(`${fieldName} must be a positive integer`, 400);
  }

  return parsed;
};

const assertValidUserId = (userId) => {
  if (!UUID_PATTERN.test(userId)) {
    throw new AppError('Valid user id is required', 400);
  }
};

const normalizeReason = (reason) => {
  if (reason === undefined || reason === null) {
    return null;
  }

  if (typeof reason !== 'string') {
    throw new AppError('Reason must be a string', 400);
  }

  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    return null;
  }

  if (trimmedReason.length > MAX_REASON_LENGTH) {
    throw new AppError(`Reason must be ${MAX_REASON_LENGTH} characters or fewer`, 400);
  }

  return trimmedReason;
};

const assertFilterValue = (value, allowedValues, fieldName) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (!allowedValues.includes(value)) {
    throw new AppError(`Invalid ${fieldName} filter`, 400);
  }

  return value;
};

const assertTargetIsManageable = (targetUser) => {
  if (!MODIFIABLE_ROLES.has(targetUser.role)) {
    throw new AppError('Admin accounts are visible but must be managed through a separate secure workflow', 403);
  }
};

const assertNotSelfAction = (actorUserId, targetUserId) => {
  if (actorUserId === targetUserId) {
    throw new AppError('You cannot perform this action on your own account', 403);
  }
};

const resolveReactivatedStatus = (targetUser) => (
  // Reactivation only restores ACTIVE after verified email; otherwise the account
  // returns to PENDING_EMAIL_VERIFICATION to keep status transitions consistent.
  targetUser.email_verified_at ? UserStatuses.ACTIVE : UserStatuses.PENDING_EMAIL_VERIFICATION
);

const buildPagination = ({ page, pageSize, total }) => ({
  page,
  pageSize,
  total,
  totalPages: total === 0 ? 0 : Math.ceil(total / pageSize)
});

export const usersService = {
  listUsers: async ({ page, pageSize, role, status, search }) => {
    const currentPage = parsePositiveInteger(page, DEFAULT_PAGE, 'page');
    const currentPageSize = parsePositiveInteger(pageSize, DEFAULT_PAGE_SIZE, 'pageSize');
    if (currentPageSize > MAX_PAGE_SIZE) {
      throw new AppError(`pageSize must be ${MAX_PAGE_SIZE} or fewer`, 400);
    }

    const normalizedRole = assertFilterValue(role, Object.values(Roles), 'role');
    const normalizedStatus = assertFilterValue(status, Object.values(UserStatuses), 'status');
    const normalizedSearch = search ? normalizeEmail(search).slice(0, 254) : '';
    const offset = (currentPage - 1) * currentPageSize;

    const { users, total } = await usersRepository.listUsers({
      role: normalizedRole,
      status: normalizedStatus,
      search: normalizedSearch,
      limit: currentPageSize,
      offset
    });

    return {
      users: users.map(sanitizeUser),
      pagination: buildPagination({
        page: currentPage,
        pageSize: currentPageSize,
        total
      })
    };
  },

  getUserDetails: async (userId) => {
    assertValidUserId(userId);

    const user = await usersRepository.findUserById(userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    return sanitizeUser(user);
  },

  suspendUser: async ({ actorUserId, targetUserId, reason }) => {
    return usersService.transitionUserStatus({
      actorUserId,
      targetUserId,
      reason,
      nextStatus: UserStatuses.SUSPENDED,
      auditAction: AuditActions.USER_SUSPEND
    });
  },

  banUser: async ({ actorUserId, targetUserId, reason }) => {
    return usersService.transitionUserStatus({
      actorUserId,
      targetUserId,
      reason,
      nextStatus: UserStatuses.BANNED,
      auditAction: AuditActions.USER_BAN
    });
  },

  reactivateUser: async ({ actorUserId, targetUserId, reason }) => {
    return usersService.transitionUserStatus({
      actorUserId,
      targetUserId,
      reason,
      nextStatus: 'reactivate',
      auditAction: AuditActions.USER_REACTIVATE
    });
  },

  transitionUserStatus: async ({ actorUserId, targetUserId, reason, nextStatus, auditAction }) => {
    assertValidUserId(actorUserId);
    assertValidUserId(targetUserId);
    assertNotSelfAction(actorUserId, targetUserId);

    const normalizedReason = normalizeReason(reason);
    const client = await db.connect();
    let updatedUser = null;

    try {
      await client.query('BEGIN');
      const targetUser = await usersRepository.findUserByIdForUpdate(targetUserId, client);
      if (!targetUser) {
        throw new AppError('User not found', 404);
      }

      assertTargetIsManageable(targetUser);

      let resolvedStatus = nextStatus;
      if (nextStatus === UserStatuses.SUSPENDED) {
        if (targetUser.status === UserStatuses.BANNED) {
          throw new AppError('Banned users cannot be suspended', 409);
        }

        if (targetUser.status === UserStatuses.SUSPENDED) {
          throw new AppError('User is already suspended', 409);
        }
      }

      if (nextStatus === UserStatuses.BANNED && targetUser.status === UserStatuses.BANNED) {
        throw new AppError('User is already banned', 409);
      }

      if (nextStatus === 'reactivate') {
        if (!REACTIVATABLE_STATUSES.has(targetUser.status)) {
          throw new AppError('Only suspended or banned users can be reactivated', 409);
        }

        resolvedStatus = resolveReactivatedStatus(targetUser);
      }

      updatedUser = await usersRepository.updateUserStatus(targetUserId, resolvedStatus, client);

      await auditService.logSensitiveAction({
        actorUserId,
        targetUserId,
        action: auditAction,
        metadata: {
          reason: normalizedReason,
          before: {
            role: targetUser.role,
            status: targetUser.status
          },
          after: {
            role: updatedUser.role,
            status: updatedUser.status
          }
        },
        runner: client
      });

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    await sessionService.destroyUserSessions(targetUserId);
    return sanitizeUser(updatedUser);
  },

  changeUserRole: async ({ actorUserId, targetUserId, role, reason }) => {
    assertValidUserId(actorUserId);
    assertValidUserId(targetUserId);
    assertNotSelfAction(actorUserId, targetUserId);

    const normalizedRole = typeof role === 'string' ? role.trim().toLowerCase() : '';
    if (!normalizedRole) {
      throw new AppError('Role is required', 400);
    }

    if (!Object.values(Roles).includes(normalizedRole)) {
      throw new AppError('Invalid role', 400);
    }

    if (!MODIFIABLE_ROLES.has(normalizedRole)) {
      throw new AppError('Admin role assignment is restricted to a separate secure workflow', 403);
    }

    const normalizedReason = normalizeReason(reason);
    const client = await db.connect();
    let updatedUser = null;

    try {
      await client.query('BEGIN');
      const targetUser = await usersRepository.findUserByIdForUpdate(targetUserId, client);
      if (!targetUser) {
        throw new AppError('User not found', 404);
      }

      assertTargetIsManageable(targetUser);

      if (targetUser.role === normalizedRole) {
        throw new AppError('User already has that role', 409);
      }

      updatedUser = await usersRepository.updateUserRole(targetUserId, normalizedRole, client);

      await auditService.logSensitiveAction({
        actorUserId,
        targetUserId,
        action: AuditActions.USER_ROLE_CHANGE,
        metadata: {
          reason: normalizedReason,
          before: {
            role: targetUser.role,
            status: targetUser.status
          },
          after: {
            role: updatedUser.role,
            status: updatedUser.status
          }
        },
        runner: client
      });

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    await sessionService.reissueUserSessions(targetUserId, { role: updatedUser.role });
    return sanitizeUser(updatedUser);
  }
};
