import { Router } from 'express';
import { Roles } from '../../shared/constants/roles.js';
import { requireAdminMfa, requireAuth, requireRoles } from '../../shared/middleware/auth.middleware.js';
import { asyncHandler } from '../../shared/utils/async-handler.js';
import { usersController } from './users.controller.js';

export const usersRouter = Router();

usersRouter.use(requireAuth);
usersRouter.use(requireRoles(Roles.ADMIN));
usersRouter.use(requireAdminMfa);

usersRouter.get('/', asyncHandler(usersController.listUsers));
usersRouter.get('/:userId', asyncHandler(usersController.getUserDetails));
usersRouter.post('/:userId/suspend', asyncHandler(usersController.suspendUser));
usersRouter.post('/:userId/ban', asyncHandler(usersController.banUser));
usersRouter.post('/:userId/reactivate', asyncHandler(usersController.reactivateUser));
usersRouter.patch('/:userId/role', asyncHandler(usersController.changeUserRole));
