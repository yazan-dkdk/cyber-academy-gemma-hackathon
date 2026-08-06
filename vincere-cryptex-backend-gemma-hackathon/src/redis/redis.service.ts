import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { RedisClientType, createClient } from 'redis';

const INCREMENT_RATE_LIMIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
local ttl = redis.call('TTL', KEYS[1])
if count == 1 or ttl < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
  ttl = redis.call('TTL', KEYS[1])
end
return {count, ttl}
`;

const CONSUME_DAILY_QUOTA_SCRIPT = `
redis.replicate_commands()
local redisTime = redis.call('TIME')
local now = tonumber(redisTime[1])
local expiresAt = (math.floor(now / 86400) + 1) * 86400
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
local ttl = redis.call('TTL', KEYS[1])

if current > 0 and ttl < 0 then
  redis.call('EXPIREAT', KEYS[1], expiresAt)
  ttl = redis.call('TTL', KEYS[1])
end

if current >= tonumber(ARGV[1]) then
  return {0, current, ttl}
end

current = redis.call('INCR', KEYS[1])
ttl = redis.call('TTL', KEYS[1])
if current == 1 or ttl < 0 then
  redis.call('EXPIREAT', KEYS[1], expiresAt)
  ttl = redis.call('TTL', KEYS[1])
end

return {1, current, ttl}
`;

const ACQUIRE_LOCK_SCRIPT = `
local acquired = redis.call('SET', KEYS[1], ARGV[1], 'NX', 'EX', ARGV[2])
if acquired then
  return {1, tonumber(ARGV[2])}
end
return {0, redis.call('TTL', KEYS[1])}
`;

const RELEASE_LOCK_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

interface RedisFailureOptions {
  failClosed?: boolean;
}

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: RedisClientType;

  constructor() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    this.client = createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: false,
      },
    });

    this.client.on('error', (error) => {
      this.logger.error(`Redis error: ${error.message}`, error.stack);
    });
  }

  get raw() {
    return this.client;
  }

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }

  async getJson<T>(key: string): Promise<T | null> {
    if (!(await this.connect())) {
      return null;
    }

    const value = await this.client.get(key);
    return value ? (JSON.parse(value) as T) : null;
  }

  async setJson(key: string, value: unknown, ttlSeconds: number) {
    await this.assertConnected();
    await this.client.set(key, JSON.stringify(value), {
      EX: ttlSeconds,
    });
  }

  async del(key: string) {
    if (!(await this.connect())) {
      return;
    }

    await this.client.del(key);
  }

  async incrementRateLimit(
    key: string,
    windowSeconds: number,
    options?: RedisFailureOptions,
  ) {
    if (!(await this.connect())) {
      if (options?.failClosed) {
        throw new ServiceUnavailableException('Security controls unavailable');
      }

      return {
        count: 1,
        ttlSeconds: windowSeconds,
      };
    }

    try {
      const result = await this.client.eval(INCREMENT_RATE_LIMIT_SCRIPT, {
        keys: [key],
        arguments: [String(windowSeconds)],
      });
      const [count, ttlSeconds] = this.parseNumberArray(result, 2);
      return {
        count,
        ttlSeconds: this.normalizeTtl(ttlSeconds, windowSeconds),
      };
    } catch {
      this.logger.warn('Redis rate limit unavailable');

      if (options?.failClosed) {
        throw new ServiceUnavailableException('Security controls unavailable');
      }

      return {
        count: 1,
        ttlSeconds: windowSeconds,
      };
    }
  }

  async acquireLock(
    key: string,
    ownerToken: string,
    ttlSeconds: number,
    options?: RedisFailureOptions,
  ) {
    if (!(await this.connect())) {
      if (options?.failClosed) {
        throw new ServiceUnavailableException('Security controls unavailable');
      }

      return {
        acquired: true,
        ttlSeconds,
      };
    }

    try {
      const result = await this.client.eval(ACQUIRE_LOCK_SCRIPT, {
        keys: [key],
        arguments: [ownerToken, String(ttlSeconds)],
      });
      const [acquired, remainingTtlSeconds] = this.parseNumberArray(result, 2);

      return {
        acquired: acquired === 1,
        ttlSeconds: this.normalizeTtl(remainingTtlSeconds, ttlSeconds),
      };
    } catch {
      this.logger.warn('Redis concurrency lock unavailable');

      if (options?.failClosed) {
        throw new ServiceUnavailableException('Security controls unavailable');
      }

      return {
        acquired: true,
        ttlSeconds,
      };
    }
  }

  async releaseLock(key: string, ownerToken: string): Promise<boolean> {
    if (!(await this.connect())) {
      this.logger.warn('Redis concurrency lock release unavailable');
      return false;
    }

    try {
      const result = await this.client.eval(RELEASE_LOCK_SCRIPT, {
        keys: [key],
        arguments: [ownerToken],
      });
      return Number(result) === 1;
    } catch {
      this.logger.warn('Redis concurrency lock release unavailable');
      return false;
    }
  }

  async consumeDailyQuota(
    key: string,
    max: number,
    options?: RedisFailureOptions,
  ) {
    const now = new Date();
    const fallbackExpiresAtEpochSeconds = Math.floor(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) / 1000,
    );
    const fallbackTtlSeconds = Math.max(
      1,
      fallbackExpiresAtEpochSeconds - Math.floor(now.getTime() / 1000),
    );

    if (!(await this.connect())) {
      if (options?.failClosed) {
        throw new ServiceUnavailableException('Security controls unavailable');
      }

      return {
        allowed: true,
        count: 1,
        ttlSeconds: fallbackTtlSeconds,
      };
    }

    try {
      const result = await this.client.eval(CONSUME_DAILY_QUOTA_SCRIPT, {
        keys: [key],
        arguments: [String(max)],
      });
      const [allowed, count, ttlSeconds] = this.parseNumberArray(result, 3);

      return {
        allowed: allowed === 1,
        count,
        ttlSeconds: this.normalizeTtl(ttlSeconds, fallbackTtlSeconds),
      };
    } catch {
      this.logger.warn('Redis daily quota unavailable');

      if (options?.failClosed) {
        throw new ServiceUnavailableException('Security controls unavailable');
      }

      return {
        allowed: true,
        count: 1,
        ttlSeconds: fallbackTtlSeconds,
      };
    }
  }

  private parseNumberArray(result: unknown, expectedLength: number): number[] {
    if (!Array.isArray(result) || result.length !== expectedLength) {
      throw new Error('Unexpected Redis script response');
    }

    const values = result.map((value) => Number(value));
    if (values.some((value) => !Number.isFinite(value))) {
      throw new Error('Unexpected Redis script response');
    }

    return values;
  }

  private normalizeTtl(ttlSeconds: number, fallbackSeconds: number): number {
    return ttlSeconds >= 0 ? Math.max(1, ttlSeconds) : fallbackSeconds;
  }

  private async assertConnected() {
    if (await this.connect()) {
      return;
    }

    throw new ServiceUnavailableException('Redis unavailable');
  }

  private async connect() {
    if (this.client.isReady) {
      return true;
    }

    if (this.client.isOpen) {
      return false;
    }

    try {
      await this.client.connect();
      return this.client.isReady;
    } catch (error) {
      this.logger.warn(
        `Redis unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }
}
