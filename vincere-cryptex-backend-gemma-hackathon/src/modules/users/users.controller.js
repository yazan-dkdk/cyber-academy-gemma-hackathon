import { usersService } from './users.service.js';

export const usersController = {
  listUsers: async (req, res) => {
    const result = await usersService.listUsers(req.query);
    res.status(200).json(result);
  },

  getUserDetails: async (req, res) => {
    const user = await usersService.getUserDetails(req.params.userId);
    res.status(200).json({ user });
  },

  suspendUser: async (req, res) => {
    const user = await usersService.suspendUser({
      actorUserId: req.user.id,
      targetUserId: req.params.userId,
      reason: req.body?.reason
    });

    res.status(200).json({
      message: 'User suspended successfully',
      user
    });
  },

  banUser: async (req, res) => {
    const user = await usersService.banUser({
      actorUserId: req.user.id,
      targetUserId: req.params.userId,
      reason: req.body?.reason
    });

    res.status(200).json({
      message: 'User banned successfully',
      user
    });
  },

  reactivateUser: async (req, res) => {
    const user = await usersService.reactivateUser({
      actorUserId: req.user.id,
      targetUserId: req.params.userId,
      reason: req.body?.reason
    });

    res.status(200).json({
      message: 'User reactivated successfully',
      user
    });
  },

  changeUserRole: async (req, res) => {
    const user = await usersService.changeUserRole({
      actorUserId: req.user.id,
      targetUserId: req.params.userId,
      role: req.body?.role,
      reason: req.body?.reason
    });

    res.status(200).json({
      message: 'User role updated successfully',
      user
    });
  }
};
