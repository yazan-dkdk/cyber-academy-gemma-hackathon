import { env } from '../../config/env.js';
import { sessionService } from '../../modules/auth/session.service.js';
import { buildSessionCookieOptions } from '../utils/cookies.js';

export const sessionMiddleware = async (req, res, next) => {
  req.session = null;
  req.user = null;

  const sessionId = req.signedCookies?.[env.sessionCookieName];
  if (!sessionId) {
    return next();
  }

  try {
    const session = await sessionService.getSession(sessionId);
    if (!session) {
      res.clearCookie(env.sessionCookieName, buildSessionCookieOptions());
      return next();
    }

    const touchedSession = await sessionService.touchSession(session.sessionId);
    if (!touchedSession) {
      res.clearCookie(env.sessionCookieName, buildSessionCookieOptions());
      return next();
    }

    req.session = touchedSession;
    req.user = {
      id: touchedSession.userId,
      role: touchedSession.role,
      mfaVerified: touchedSession.mfaVerified
    };
    return next();
  } catch (error) {
    return next(error);
  }
};
