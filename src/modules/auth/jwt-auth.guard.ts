import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../../common/auth/public.decorator.js';
import type { AuthenticatedRequest } from '../../common/auth/auth-user.js';
import { DomainException } from '../../common/errors/domain.exception.js';
import type { Role } from '../../generated/prisma/client.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new DomainException('UNAUTHENTICATED', 'Authentication required.');
    }
    const token = header.slice('Bearer '.length);
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; role: Role; sid: string }>(token, {
        algorithms: ['HS256'],
        issuer: 'shopcore-api',
        audience: 'shopcore',
      });
      request.user = { id: payload.sub, role: payload.role, sessionId: payload.sid };
      return true;
    } catch {
      throw new DomainException('INVALID_ACCESS_TOKEN', 'Access token is invalid or expired.');
    }
  }
}
