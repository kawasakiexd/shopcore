import { randomUUID } from 'node:crypto';
import { Module, StandardSchemaValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule, seconds } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { Redis } from 'ioredis';
import { LoggerModule } from 'nestjs-pino';
import { envSchema, type Env } from './config/env.schema.js';
import type { AuthUser } from './common/auth/auth-user.js';
import { createValidationException } from './common/errors/validation-exception.factory.js';
import { ProblemDetailsFilter } from './common/errors/problem-details.filter.js';
import { STRICT_THROTTLE_KEY } from './common/throttling/strict-throttle.decorator.js';
import { RedisThrottlerStorage } from './common/throttling/redis-throttler.storage.js';
import { CacheModule } from './infra/cache/cache.module.js';
import { PrismaModule } from './infra/prisma/prisma.module.js';
import { REDIS } from './infra/redis/redis.constants.js';
import { RedisModule } from './infra/redis/redis.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { JwtAuthGuard } from './modules/auth/jwt-auth.guard.js';
import { RolesGuard } from './modules/auth/roles.guard.js';
import { CartModule } from './modules/cart/cart.module.js';
import { CatalogModule } from './modules/catalog/catalog.module.js';
import { DemoMaintenanceGuard } from './modules/demo/demo-maintenance.guard.js';
import { DemoModule } from './modules/demo/demo.module.js';
import { OrdersModule } from './modules/orders/orders.module.js';
import { PaymentsModule } from './modules/payments/payments.module.js';
import { StatsModule } from './modules/stats/stats.module.js';
import { SystemModule } from './modules/system/system.module.js';
import { UsersModule } from './modules/users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validationSchema: envSchema }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL', { infer: true }),
          genReqId: (req: Request, res: Response) => {
            const incoming = req.headers['x-request-id'];
            const id =
              typeof incoming === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(incoming)
                ? incoming
                : randomUUID();
            res.setHeader('X-Request-Id', id);
            return id;
          },
          customProps: (req: Request & { user?: AuthUser }) => ({ userId: req.user?.id }),
          redact: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.headers["stripe-signature"]',
          ],
          autoLogging: {
            ignore: (req: Request) => (req.url ?? '').startsWith('/health'),
          },
          serializers: {
            req: (req: Request & { id?: string }) => ({
              id: req.id,
              method: req.method,
              url: req.url,
            }),
          },
          customLogLevel: (_req: Request, res: Response, err?: Error) => {
            if (err || res.statusCode >= 500) return 'error';
            return 'info';
          },
          ...(config.get('NODE_ENV', { infer: true }) === 'development'
            ? {
                transport: { target: 'pino-pretty', options: { colorize: true, singleLine: true } },
              }
            : {}),
        },
      }),
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      inject: [REDIS, ConfigService],
      useFactory: (redis: Redis, config: ConfigService<Env, true>) => ({
        storage: new RedisThrottlerStorage(redis),
        getTracker: (req: Record<string, unknown>) =>
          typeof req.ip === 'string' ? req.ip : 'unknown',
        throttlers: [
          {
            name: 'default',
            ttl: seconds(60),
            limit: config.get('THROTTLE_GLOBAL_LIMIT', { infer: true }),
            generateKey: (_ctx: unknown, tracker: string) => `default:${tracker}`,
          },
          {
            name: 'strict',
            ttl: seconds(60),
            limit: 10,
            skipIf: (context) => {
              const handler = context.getHandler();
              const cls = context.getClass();
              return (
                !Reflect.getMetadata(STRICT_THROTTLE_KEY, handler) &&
                !Reflect.getMetadata(STRICT_THROTTLE_KEY, cls)
              );
            },
          },
        ],
      }),
    }),
    PrismaModule,
    RedisModule,
    CacheModule,
    SystemModule,
    AuthModule,
    UsersModule,
    CatalogModule,
    CartModule,
    OrdersModule,
    PaymentsModule,
    StatsModule,
    DemoModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: DemoMaintenanceGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    {
      provide: APP_PIPE,
      useFactory: () =>
        new StandardSchemaValidationPipe({ exceptionFactory: createValidationException }),
    },
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
  ],
})
export class AppModule {}
