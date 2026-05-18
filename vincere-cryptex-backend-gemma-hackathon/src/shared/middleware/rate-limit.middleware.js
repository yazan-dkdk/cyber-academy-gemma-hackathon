import { redis } from '../../config/redis.js';
import { AppError } from '../errors/app-error.js';

export const rateLimit = ({ prefix, windowSeconds, maxRequests, keyGenerator }) => {
  return async (req, _res, next) => {
    const key = `${prefix}:${keyGenerator(req)}`;
    const current = await redis.incr(key);

    if (current === 1) {
      await redis.expire(key, windowSeconds);
    }

    if (current > maxRequests) {
      return next(new AppError('Too many requests', 429));
    }

    return next();
  };
};
