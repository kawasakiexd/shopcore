import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import type { Env } from '../../config/env.schema.js';
import { runSeed } from '../../database/seed/seed.js';
import { CacheService } from '../../infra/cache/cache.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { REDIS } from '../../infra/redis/redis.constants.js';
import { StorageService } from '../../infra/storage/storage.service.js';
import {
  DEMO_ADMIN_EMAIL,
  DEMO_ADMIN_PASSWORD,
  DEMO_CUSTOMER_EMAIL,
  DEMO_CUSTOMER_PASSWORD,
  DEMO_LIMITS,
} from './demo.constants.js';

const LOCK_KEY = 'lock:demo-reset';

@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);
  private resetting = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly storage: StorageService,
    private readonly config: ConfigService<Env, true>,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  isResetting(): boolean {
    return this.resetting;
  }

  describe() {
    const demoMode = this.config.get('DEMO_MODE', { infer: true });
    return {
      demoMode,
      resetSchedule: 'Daily at 03:00 UTC',
      nextResetAt: demoMode ? nextResetAt().toISOString() : null,
      accounts: demoMode
        ? [
            { role: 'ADMIN', email: DEMO_ADMIN_EMAIL, password: DEMO_ADMIN_PASSWORD },
            { role: 'CUSTOMER', email: DEMO_CUSTOMER_EMAIL, password: DEMO_CUSTOMER_PASSWORD },
          ]
        : [],
      stripeTestCard: {
        number: '4242 4242 4242 4242',
        expiry: 'any future date',
        cvc: 'any 3 digits',
      },
      limits: {
        ...DEMO_LIMITS,
        uploadDailyQuota: this.config.get('UPLOAD_DAILY_QUOTA', { infer: true }),
      },
    };
  }

  async reset(): Promise<void> {
    const locked = await this.redis.set(LOCK_KEY, '1', 'EX', 600, 'NX');
    if (locked !== 'OK') {
      this.logger.warn('Demo reset skipped; lock already held');
      return;
    }
    const started = Date.now();
    this.resetting = true;
    try {
      await this.prisma.$executeRawUnsafe(`
        TRUNCATE TABLE
          stripe_events,
          order_status_changes,
          payments,
          order_items,
          orders,
          cart_items,
          product_images,
          products,
          categories,
          refresh_tokens,
          users
        RESTART IDENTITY CASCADE
      `);
      await runSeed(this.prisma, { now: new Date() });
      try {
        await this.storage.deletePrefix('uploads/');
      } catch (error) {
        this.logger.warn({ err: error }, 'Failed to delete R2 uploads during demo reset');
      }
      await this.cache.bump('catalog');
      await this.cache.bump('stats');
      this.logger.log({ durationMs: Date.now() - started }, 'demo.reset');
    } finally {
      this.resetting = false;
      await this.redis.del(LOCK_KEY);
    }
  }
}

function nextResetAt(): Date {
  const now = new Date();
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 3, 0, 0, 0),
  );
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}
