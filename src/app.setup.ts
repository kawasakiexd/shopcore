import { type INestApplication, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Env } from './config/env.schema.js';
import { setupSwagger } from './swagger.js';

export function configureApp(app: NestExpressApplication | INestApplication): void {
  const expressApp = app as NestExpressApplication;
  const config = app.get(ConfigService<Env, true>);

  expressApp.useSecurityHeaders();
  expressApp.set('trust proxy', config.get('TRUST_PROXY_HOPS', { infer: true }));
  expressApp.useBodyParser('json', { limit: '100kb' });

  const corsOrigins = config
    .get('CORS_ORIGINS', { infer: true })
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (corsOrigins.length > 0) {
    expressApp.enableCors({ origin: corsOrigins });
  }

  expressApp.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  if (config.get('SWAGGER_ENABLED', { infer: true })) {
    setupSwagger(expressApp, config.get('PUBLIC_API_URL', { infer: true }));
  }
}
