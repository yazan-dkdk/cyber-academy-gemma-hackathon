import { Router } from 'express';
import { env } from '../../config/env.js';
import { Roles } from '../../shared/constants/roles.js';
import { requireAuth, requireRoles } from '../../shared/middleware/auth.middleware.js';
import { rateLimit } from '../../shared/middleware/rate-limit.middleware.js';
import { asyncHandler } from '../../shared/utils/async-handler.js';
import { challengesController } from './challenges.controller.js';

export const challengesRouter = Router();

challengesRouter.use(requireAuth);
challengesRouter.use(requireRoles(Roles.STUDENT));

challengesRouter.get('/', asyncHandler(challengesController.listPublishedChallenges));
challengesRouter.get('/:challengeId', asyncHandler(challengesController.getChallengeDetails));
challengesRouter.post(
  '/:challengeId/hints/:hintPosition/use',
  asyncHandler(challengesController.useHint)
);
challengesRouter.post(
  '/:challengeId/submit-flag',
  rateLimit({
    prefix: 'rate_limit:challenge_flag_submission',
    windowSeconds: env.flagSubmissionRateLimitWindowSeconds,
    maxRequests: env.flagSubmissionRateLimitMax,
    keyGenerator: (req) => `${req.user?.id ?? 'anonymous'}:${req.params.challengeId}:${req.ip}`
  }),
  asyncHandler(challengesController.submitFlag)
);
