import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import { DomainException } from '../../common/errors/domain.exception.js';
import type { Env } from '../../config/env.schema.js';
import { REDIS } from '../../infra/redis/redis.constants.js';

@Injectable()
export class UploadQuotaService {
  private readonly logger = new Logger(UploadQuotaService.name);

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async consume(ip: string): Promise<void> {
    if (!this.config.get('DEMO_MODE', { infer: true })) return;
    const quota = this.config.get('UPLOAD_DAILY_QUOTA', { infer: true });
    const day = new Date().toISOString().slice(0, 10);
    const key = `quota:upload:${day}:${ip}`;
    try {
      const used = await this.redis.incr(key);
      if (used === 1) await this.redis.expire(key, 24 * 60 * 60);
      if (used > quota) {
        throw new DomainException('UPLOAD_QUOTA_EXCEEDED', 'Daily upload quota exceeded.');
      }
    } catch (error) {
      if (error instanceof DomainException) throw error;
      this.logger.warn({ err: error }, 'Upload quota check failed open');
    }
  }
}
