import { randomUUID } from 'crypto';
import { redis } from '../../config/redis.js';
import { env } from '../../config/env.js';

const getSessionKey = (sessionId) => `session:${sessionId}`;
const getUserSessionsKey = (userId) => `user_sessions:${userId}`;

const getStoredSession = async (sessionId) => {
  const rawSession = await redis.get(getSessionKey(sessionId));
  return rawSession ? JSON.parse(rawSession) : null;
};

const destroyStoredSession = async (sessionId, session) => {
  const pipeline = redis.multi().del(getSessionKey(sessionId));

  if (session?.userId) {
    pipeline.sRem(getUserSessionsKey(session.userId), sessionId);
  }

  await pipeline.exec();
};

const isPastAbsoluteLifetime = (session) => {
  const createdAt = new Date(session.createdAt).getTime();
  return Date.now() - createdAt > env.sessionTtlSeconds * 1000;
};

const buildSessionPayload = (input) => ({
  sessionId: input.sessionId,
  userId: input.userId,
  role: input.role,
  userStatus: input.userStatus,
  mfaVerified: input.mfaVerified,
  createdAt: input.createdAt,
  lastSeen: input.lastSeen
});

export const sessionService = {
  createSession: async ({ userId, role, userStatus, mfaVerified }) => {
    const now = new Date().toISOString();
    const session = buildSessionPayload({
      sessionId: randomUUID(),
      userId,
      role,
      userStatus,
      mfaVerified,
      createdAt: now,
      lastSeen: now
    });

    await redis
      .multi()
      .set(getSessionKey(session.sessionId), JSON.stringify(session), {
        EX: env.sessionIdleTtlSeconds
      })
      .sAdd(getUserSessionsKey(userId), session.sessionId)
      .expire(getUserSessionsKey(userId), env.sessionTtlSeconds)
      .exec();

    return session;
  },

  getSession: async (sessionId) => {
    const session = await getStoredSession(sessionId);
    if (!session) {
      return null;
    }

    if (isPastAbsoluteLifetime(session)) {
      await destroyStoredSession(sessionId, session);
      return null;
    }

    return session;
  },

  touchSession: async (sessionId) => {
    const session = await sessionService.getSession(sessionId);
    if (!session) {
      return null;
    }

    const updatedSession = {
      ...session,
      lastSeen: new Date().toISOString()
    };

    await redis.set(getSessionKey(sessionId), JSON.stringify(updatedSession), {
      EX: env.sessionIdleTtlSeconds
    });
    await redis.expire(getUserSessionsKey(updatedSession.userId), env.sessionTtlSeconds);

    return updatedSession;
  },

  destroySession: async (sessionId) => {
    const session = await getStoredSession(sessionId);
    if (!session) {
      return;
    }

    await destroyStoredSession(sessionId, session);
  },

  destroyUserSessions: async (userId) => {
    const userSessionsKey = getUserSessionsKey(userId);
    const sessionIds = await redis.sMembers(userSessionsKey);

    if (sessionIds.length === 0) {
      await redis.del(userSessionsKey);
      return;
    }

    const pipeline = redis.multi();
    for (const sessionId of sessionIds) {
      pipeline.del(getSessionKey(sessionId));
    }
    pipeline.del(userSessionsKey);
    await pipeline.exec();
  },

  regenerateSession: async (sessionId, overrides = {}) => {
    const currentSession = await sessionService.getSession(sessionId);
    if (!currentSession) {
      return null;
    }

    const nextSession = await sessionService.createSession({
      userId: currentSession.userId,
      role: overrides.role ?? currentSession.role,
      userStatus: overrides.userStatus ?? currentSession.userStatus,
      mfaVerified: overrides.mfaVerified ?? currentSession.mfaVerified
    });

    await sessionService.destroySession(sessionId);
    return nextSession;
  },

  reissueUserSessions: async (userId, overrides = {}) => {
    const sessionIds = await redis.sMembers(getUserSessionsKey(userId));

    for (const sessionId of sessionIds) {
      await sessionService.regenerateSession(sessionId, overrides);
    }
  }
};
