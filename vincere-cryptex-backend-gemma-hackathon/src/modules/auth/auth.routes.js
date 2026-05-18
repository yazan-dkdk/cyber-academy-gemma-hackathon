import { Router } from 'express';
import { env } from '../../config/env.js';
import { Roles } from '../../shared/constants/roles.js';
import { requireAdminMfa, requireAuth, requireRoles } from '../../shared/middleware/auth.middleware.js';
import { rateLimit } from '../../shared/middleware/rate-limit.middleware.js';
import { asyncHandler } from '../../shared/utils/async-handler.js';
import { normalizeEmail } from '../../shared/utils/validation.js';
import { authController } from './auth.controller.js';

export const authRouter = Router();

const getEmailRateLimitKey = (req) => `${req.ip}:${normalizeEmail(req.body?.email)}`;
const getAdminMfaRateLimitKey = (req) => `${req.user?.id ?? 'anonymous'}:${req.ip}`;

authRouter.post(
  '/register',
  rateLimit({
    prefix: 'rate_limit:register',
    windowSeconds: env.registerRateLimitWindowSeconds,
    maxRequests: env.registerRateLimitMax,
    keyGenerator: (req) => req.ip
  }),
  asyncHandler(authController.register)
);

authRouter.post(
  '/login',
  rateLimit({
    prefix: 'rate_limit:login',
    windowSeconds: env.loginRateLimitWindowSeconds,
    maxRequests: env.loginRateLimitMax,
    keyGenerator: getEmailRateLimitKey
  }),
  asyncHandler(authController.login)
);

authRouter.post('/logout', requireAuth, asyncHandler(authController.logout));
authRouter.get('/me', requireAuth, asyncHandler(authController.me));

authRouter.post(
  '/forgot-password',
  rateLimit({
    prefix: 'rate_limit:forgot_password',
    windowSeconds: env.forgotPasswordRateLimitWindowSeconds,
    maxRequests: env.forgotPasswordRateLimitMax,
    keyGenerator: getEmailRateLimitKey
  }),
  asyncHandler(authController.forgotPassword)
);

authRouter.post('/reset-password', asyncHandler(authController.resetPassword));

authRouter.post(
  '/mfa/setup',
  requireAuth,
  requireRoles(Roles.ADMIN),
  asyncHandler(authController.setupAdminMfa)
);

authRouter.post(
  '/mfa/verify',
  requireAuth,
  requireRoles(Roles.ADMIN),
  rateLimit({
    prefix: 'rate_limit:mfa_verify',
    windowSeconds: env.mfaAttemptWindowSeconds,
    maxRequests: env.mfaAttemptMaxFailures,
    keyGenerator: getAdminMfaRateLimitKey
  }),
  asyncHandler(authController.verifyAdminMfa)
);

authRouter.post(
  '/mfa/disable',
  requireAuth,
  requireRoles(Roles.ADMIN),
  requireAdminMfa,
  rateLimit({
    prefix: 'rate_limit:mfa_disable',
    windowSeconds: env.mfaAttemptWindowSeconds,
    maxRequests: env.mfaAttemptMaxFailures,
    keyGenerator: getAdminMfaRateLimitKey
  }),
  asyncHandler(authController.disableAdminMfa)
);

authRouter.post(
  '/sessions/revoke',
  requireAuth,
  requireAdminMfa,
  asyncHandler(authController.revokeCurrentSession)
);

authRouter.post(
  '/sessions/revoke-all',
  requireAuth,
  requireAdminMfa,
  asyncHandler(authController.revokeAllSessions)
);
