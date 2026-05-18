import { AppError } from '../errors/app-error.js';
import { Roles, UserStatuses } from '../constants/roles.js';

export const requireAuth = (req, _res, next) => {
  if (!req.user || !req.session) {
    return next(new AppError('Authentication required', 401));
  }

  if (req.session.userStatus === UserStatuses.SUSPENDED) {
    return next(new AppError('Account suspended', 403));
  }

  if (req.session.userStatus === UserStatuses.BANNED) {
    return next(new AppError('Account banned', 403));
  }

  return next();
};

export const requireRoles = (...allowedRoles) => (req, _res, next) => {
  if (!req.user) {
    return next(new AppError('Authentication required', 401));
  }

  if (!allowedRoles.includes(req.user.role)) {
    return next(new AppError('Forbidden', 403));
  }

  return next();
};

export const requireAdminMfa = (req, _res, next) => {
  if (!req.user) {
    return next(new AppError('Authentication required', 401));
  }

  if (req.user.role === Roles.ADMIN && !req.user.mfaVerified) {
    return next(new AppError('Admin MFA verification required', 403));
  }

  return next();
};
