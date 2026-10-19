import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from '../../common/auth/auth-user.js';
import { ROLES_KEY } from '../../common/auth/roles.decorator.js';
import { DomainException } from '../../common/errors/domain.exception.js';
import type { Role } from '../../generated/prisma/client.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles?.length) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) throw new DomainException('UNAUTHENTICATED', 'Authentication required.');
    if (!roles.includes(request.user.role)) {
      throw new DomainException('FORBIDDEN', 'Insufficient permissions.');
    }
    return true;
  }
}
