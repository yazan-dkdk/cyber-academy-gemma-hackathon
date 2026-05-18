import { env } from '../../config/env.js';
import { redis } from '../../config/redis.js';
import { AppError } from '../../shared/errors/app-error.js';

export const MfaAttemptActions = Object.freeze({
  VERIFY: 'verify',
  DISABLE: 'disable'
});

const getFailureKey = ({ action, userId }) => `auth:mfa_attempts:${action}:${userId}`;
const getLockKey = ({ action, userId }) => `auth:mfa_lock:${action}:${userId}`;

export const mfaAttemptService = {
  assertAllowed: async ({ action, userId }) => {
    const lockKey = getLockKey({ action, userId });
    const isLocked = await redis.exists(lockKey);

    if (isLocked) {
      throw new AppError('Too many MFA attempts. Try again later', 429);
    }
  },

  recordFailure: async ({ action, userId }) => {
    const failureKey = getFailureKey({ action, userId });
    const lockKey = getLockKey({ action, userId });
    const failures = await redis.incr(failureKey);
    const pipeline = redis.multi();

    if (failures === 1) {
      pipeline.expire(failureKey, env.mfaAttemptWindowSeconds);
    }

    if (failures >= env.mfaAttemptMaxFailures) {
      pipeline.set(lockKey, '1', {
        EX: env.mfaAttemptLockSeconds
      });
      pipeline.del(failureKey);
    }

    await pipeline.exec();
  },

  clearFailures: async ({ action, userId }) => {
    const failureKey = getFailureKey({ action, userId });
    const lockKey = getLockKey({ action, userId });

    await redis.multi().del(failureKey).del(lockKey).exec();
  }
};
