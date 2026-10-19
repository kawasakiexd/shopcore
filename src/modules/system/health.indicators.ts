import { Inject, Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import type { Redis } from 'ioredis';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { REDIS } from '../../infra/redis/redis.constants.js';

@Injectable()
export class HealthIndicators {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  checkDb() {
    return this.healthIndicatorService.check('db').attempt(async () => {
      await this.prisma.$queryRaw`SELECT 1`;
    });
  }

  checkRedis() {
    return this.healthIndicatorService.check('redis').attempt(async () => {
      await this.redis.ping();
    });
  }
}
