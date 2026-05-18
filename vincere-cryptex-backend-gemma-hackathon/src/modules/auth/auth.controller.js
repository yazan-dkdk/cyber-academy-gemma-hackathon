import { env } from '../../config/env.js';
import { buildSessionCookieOptions } from '../../shared/utils/cookies.js';
import { authService } from './auth.service.js';

export const authController = {
  register: async (req, res) => {
    const result = await authService.register(req.body);
    res.status(202).json(result);
  },

  login: async (req, res) => {
    const result = await authService.login(req.body);
    res.cookie(env.sessionCookieName, result.session.sessionId, buildSessionCookieOptions());
    res.status(200).json(result.response);
  },

  logout: async (req, res) => {
    await authService.logout(req.session.sessionId);
    res.clearCookie(env.sessionCookieName, buildSessionCookieOptions());
    res.status(204).send();
  },

  me: async (req, res) => {
    const user = await authService.getCurrentUser(req.user.id);
    res.status(200).json({
      user,
      session: req.session
    });
  },

  forgotPassword: async (req, res) => {
    await authService.createPasswordReset(req.body);
    res.status(202).json({
      message: 'If email exists, a password reset link will be sent'
    });
  },

  resetPassword: async (req, res) => {
    await authService.resetPassword(req.body);
    res.status(200).json({
      message: 'Password updated successfully'
    });
  },

  setupAdminMfa: async (req, res) => {
    const result = await authService.setupAdminMfa({
      userId: req.user.id,
      session: req.session
    });
    res.status(200).json(result);
  },

  verifyAdminMfa: async (req, res) => {
    const result = await authService.verifyAdminMfa({
      userId: req.user.id,
      sessionId: req.session.sessionId,
      code: req.body?.code
    });

    res.cookie(env.sessionCookieName, result.session.sessionId, buildSessionCookieOptions());
    res.status(200).json(result.response);
  },

  disableAdminMfa: async (req, res) => {
    const result = await authService.disableAdminMfa({
      userId: req.user.id,
      sessionId: req.session.sessionId,
      code: req.body?.code
    });

    res.cookie(env.sessionCookieName, result.session.sessionId, buildSessionCookieOptions());
    res.status(200).json({
      message: 'Admin MFA disabled'
    });
  },

  revokeCurrentSession: async (req, res) => {
    await authService.logout(req.session.sessionId);
    res.clearCookie(env.sessionCookieName, buildSessionCookieOptions());
    res.status(204).send();
  },

  revokeAllSessions: async (req, res) => {
    await authService.revokeAllSessions(req.user.id);
    res.clearCookie(env.sessionCookieName, buildSessionCookieOptions());
    res.status(204).send();
  }
};
