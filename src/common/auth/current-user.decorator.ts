import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthUser, AuthenticatedRequest } from './auth-user.js';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user;
  },
);
