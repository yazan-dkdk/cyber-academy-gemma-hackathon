import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { RedisClientType, createClient } from 'redis';

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
    options?: { failClosed?: boolean },
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
      const count = await this.client.incr(key);
      if (count === 1) {
        await this.client.expire(key, windowSeconds);
      }

      const ttlSeconds = await this.client.ttl(key);
      return {
        count,
        ttlSeconds,
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
