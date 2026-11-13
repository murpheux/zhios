import type { Redis } from 'ioredis';
import type { CachePort } from '../application/ports';
import { recordCacheLookup } from './newrelic';

export interface CacheLogger {
  warn(obj: unknown, msg?: string): void;
}

/** Redis-backed cache. Backend failures are logged and degrade to a cache miss; they never fail a request. */
export class RedisCache implements CachePort {
  constructor(
    private readonly redis: Redis,
    private readonly logger: CacheLogger,
  ) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(key);
      recordCacheLookup(raw !== null);
      return raw === null ? null : (JSON.parse(raw) as T);
    } catch (err) {
      this.logger.warn({ err, key }, 'cache get failed');
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (err) {
      this.logger.warn({ err, key }, 'cache set failed');
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (err) {
      this.logger.warn({ err, key }, 'cache del failed');
    }
  }
}
