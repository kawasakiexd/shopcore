import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS } from '../redis/redis.constants.js';

const VERSION_TTL_SECONDS = 7 * 24 * 60 * 60;

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async getOrSet<T>(
    ns: string,
    key: string,
    ttlSeconds: number,
    loader: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.read<T>(ns, key);
    if (cached !== undefined) return cached;
    const value = await loader();
    await this.write(ns, key, ttlSeconds, value);
    return value;
  }

  async bump(ns: string): Promise<void> {
    try {
      await this.redis.set(`cache:${ns}:ver`, String(Date.now()), 'EX', VERSION_TTL_SECONDS);
    } catch (error) {
      this.logger.warn({ err: error, ns }, 'Cache bump failed');
    }
  }

  private async read<T>(ns: string, key: string): Promise<T | undefined> {
    try {
      const version = await this.currentVersion(ns);
      const raw = await this.redis.get(`cache:${ns}:v${version}:${key}`);
      if (raw === null) return undefined;
      return JSON.parse(raw) as T;
    } catch (error) {
      this.logger.warn({ err: error, ns, key }, 'Cache read failed');
      return undefined;
    }
  }

  private async write<T>(ns: string, key: string, ttlSeconds: number, value: T): Promise<void> {
    try {
      const version = await this.currentVersion(ns);
      await this.redis.set(
        `cache:${ns}:v${version}:${key}`,
        JSON.stringify(value),
        'EX',
        ttlSeconds,
      );
    } catch (error) {
      this.logger.warn({ err: error, ns, key }, 'Cache write failed');
    }
  }

  private async currentVersion(ns: string): Promise<string> {
    const verKey = `cache:${ns}:ver`;
    const existing = await this.redis.get(verKey);
    if (existing) return existing;
    const created = String(Date.now());
    const set = await this.redis.set(verKey, created, 'EX', VERSION_TTL_SECONDS, 'NX');
    if (set === 'OK') return created;
    return (await this.redis.get(verKey)) ?? created;
  }
}
