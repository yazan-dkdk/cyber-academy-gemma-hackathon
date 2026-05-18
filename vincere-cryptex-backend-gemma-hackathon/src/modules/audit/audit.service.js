import { AppError } from '../../shared/errors/app-error.js';
import { auditRepository } from './audit.repository.js';

export const AuditActions = Object.freeze({
  USER_SUSPEND: 'user.suspend',
  USER_BAN: 'user.ban',
  USER_REACTIVATE: 'user.reactivate',
  USER_ROLE_CHANGE: 'user.role_change'
});

export const auditService = {
  logSensitiveAction: async ({ actorUserId, targetUserId = null, action, metadata = {}, runner }) => {
    if (!actorUserId) {
      throw new AppError('Audit actor is required', 500);
    }

    if (typeof action !== 'string' || !action.trim()) {
      throw new AppError('Audit action is required', 500);
    }

    await auditRepository.createLog(
      {
        actorUserId,
        targetUserId,
        action,
        metadata
      },
      runner
    );
  }
};
