import { Router } from 'express';
import { Roles } from '../../shared/constants/roles.js';
import { requireAuth, requireRoles } from '../../shared/middleware/auth.middleware.js';
import { asyncHandler } from '../../shared/utils/async-handler.js';
import { labsController } from './labs.controller.js';

export const labsRouter = Router();

labsRouter.use(requireAuth);
labsRouter.use(requireRoles(Roles.STUDENT));

labsRouter.get('/', asyncHandler(labsController.listPublishedLabs));
labsRouter.get('/access/:proxyToken/validate', asyncHandler(labsController.validateLabAccess));
labsRouter.get('/:labId', asyncHandler(labsController.getLabDetails));
labsRouter.get('/:labId/instance', asyncHandler(labsController.getCurrentLabInstance));
labsRouter.post('/:labId/start', asyncHandler(labsController.startLab));
labsRouter.post('/:labId/reset', asyncHandler(labsController.resetLab));
labsRouter.post('/:labId/terminate', asyncHandler(labsController.terminateLab));
