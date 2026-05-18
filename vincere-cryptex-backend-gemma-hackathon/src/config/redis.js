import { createClient } from 'redis';
import { env } from './env.js';

export const redis = createClient({
  url: env.redisUrl
});

redis.on('error', (error) => {
  console.error('Redis client error', error);
});

export const initializeRedis = async () => {
  if (!redis.isOpen) {
    await redis.connect();
  }
};
