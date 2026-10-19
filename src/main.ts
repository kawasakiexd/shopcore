import 'reflect-metadata';
import { Logger } from 'nestjs-pino';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { ConfigService } from '@nestjs/config';
import type { Env } from './config/env.schema.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    bufferLogs: true,
    routeConflictPolicy: { duplicate: 'error', shadow: 'warn' },
  });
  app.useLogger(app.get(Logger));
  configureApp(app);
  app.enableShutdownHooks();

  const config = app.get(ConfigService<Env, true>);
  const port = config.get('PORT', { infer: true });
  await app.listen(port, '0.0.0.0');
  app.get(Logger).log(`shopcore listening on ${config.get('PUBLIC_API_URL', { infer: true })}`);
}

await bootstrap();
