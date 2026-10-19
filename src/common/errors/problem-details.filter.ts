import { randomUUID } from 'node:crypto';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { Env } from '../../config/env.schema.js';
import { Prisma } from '../../generated/prisma/client.js';
import { DomainException } from './domain.exception.js';
import { ERROR_CATALOG, type ErrorCode, errorCodeToSlug } from './error-catalog.js';

type BodyParserLike = { type?: string; status?: number; message?: string };

@Injectable()
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') return;

    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { id?: string }>();
    const res = ctx.getResponse<Response>();
    const { code, detail, extensions } = this.mapException(exception);
    const catalog = ERROR_CATALOG[code];
    const publicUrl = this.config.get('PUBLIC_API_URL', { infer: true });
    const hideDetail =
      this.config.get('NODE_ENV', { infer: true }) === 'production' && catalog.status >= 500;
    const incomingId = req.headers['x-request-id'];
    const requestId =
      typeof req.id === 'string'
        ? req.id
        : typeof incomingId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(incomingId)
          ? incomingId
          : randomUUID();
    res.setHeader('X-Request-Id', requestId);

    if (catalog.status >= 500) {
      this.logger.error(
        { err: exception, requestId, code },
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    if (code === 'INVALID_ACCESS_TOKEN') {
      res.setHeader('WWW-Authenticate', 'Bearer error="invalid_token"');
    } else if (catalog.status === 401) {
      res.setHeader('WWW-Authenticate', 'Bearer');
    }

    if (code === 'RATE_LIMITED') {
      const retryAfter = res.getHeader('Retry-After') ?? res.getHeader('Retry-After-strict');
      if (retryAfter !== undefined) res.setHeader('Retry-After', retryAfter);
    }

    const body: Record<string, unknown> = {
      type: `${publicUrl}/problems/${errorCodeToSlug(code)}`,
      title: catalog.title,
      status: catalog.status,
      instance: req.originalUrl,
      code,
      requestId,
      ...(hideDetail ? {} : detail ? { detail } : {}),
      ...extensions,
    };

    res.status(catalog.status).type('application/problem+json').send(body);
  }

  private mapException(exception: unknown): {
    code: ErrorCode;
    detail?: string;
    extensions?: Record<string, unknown>;
  } {
    if (exception instanceof DomainException) {
      return { code: exception.code, detail: exception.detail, extensions: exception.extensions };
    }

    if (exception instanceof ThrottlerException) {
      return { code: 'RATE_LIMITED', detail: 'Too many requests. Please retry later.' };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002')
        return { code: 'CONFLICT', detail: 'Unique constraint violated.' };
      if (exception.code === 'P2025') {
        return { code: 'RESOURCE_NOT_FOUND', extensions: { resource: 'Resource' } };
      }
    }

    const parser = exception as BodyParserLike;
    if (parser?.type === 'entity.parse.failed') {
      return { code: 'BAD_REQUEST', detail: 'Malformed JSON body.' };
    }
    if (parser?.type === 'entity.too.large') {
      return { code: 'PAYLOAD_TOO_LARGE', detail: 'Request body exceeds 100 KB.' };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status === 404) return { code: 'NOT_FOUND', detail: 'No route matches this request.' };
      if (status === 413) return { code: 'PAYLOAD_TOO_LARGE' };
      if (status === 415) return { code: 'UNSUPPORTED_MEDIA_TYPE' };
      if (status >= 500) return { code: 'INTERNAL_ERROR' };
      const response = exception.getResponse();
      const message =
        typeof response === 'string'
          ? response
          : typeof response === 'object' && response !== null && 'message' in response
            ? String(Reflect.get(response, 'message'))
            : exception.message;
      return { code: 'BAD_REQUEST', detail: message };
    }

    return {
      code: 'INTERNAL_ERROR',
      detail: exception instanceof Error ? exception.message : 'Unexpected error',
    };
  }
}
