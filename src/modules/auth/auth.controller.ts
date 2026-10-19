import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { hours, minutes } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { Public } from '../../common/auth/public.decorator.js';
import { ApiProblems, ApiZodResponse } from '../../common/http/api-docs.decorators.js';
import { StrictThrottle } from '../../common/throttling/strict-throttle.decorator.js';
import {
  AuthResponseSchema,
  LoginSchema,
  LogoutSchema,
  RefreshSchema,
  RegisterSchema,
  TokenPairSchema,
  type LoginInput,
  type RefreshInput,
  type RegisterInput,
} from './auth.schemas.js';
import { AuthService } from './auth.service.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @Public()
  @StrictThrottle({ limit: 5, ttl: hours(1) })
  @ApiOperation({ summary: 'Register a customer account' })
  @ApiZodResponse({ status: 201, schema: AuthResponseSchema, description: 'Registered' })
  @ApiProblems('EMAIL_TAKEN', 'DEMO_LIMIT_REACHED')
  register(@Body({ schema: RegisterSchema }) body: RegisterInput, @Req() req: Request) {
    return this.auth.register(body, req.ip, userAgentOf(req));
  }

  @Post('login')
  @Public()
  @HttpCode(200)
  @StrictThrottle({ limit: 10, ttl: minutes(1) })
  @ApiOperation({ summary: 'Log in' })
  @ApiZodResponse({ status: 200, schema: AuthResponseSchema, description: 'Authenticated' })
  @ApiProblems('INVALID_CREDENTIALS', 'ACCOUNT_BLOCKED')
  login(@Body({ schema: LoginSchema }) body: LoginInput, @Req() req: Request) {
    return this.auth.login(body, req.ip, userAgentOf(req));
  }

  @Post('refresh')
  @Public()
  @HttpCode(200)
  @StrictThrottle({ limit: 30, ttl: minutes(1) })
  @ApiOperation({ summary: 'Rotate refresh token' })
  @ApiZodResponse({ status: 200, schema: TokenPairSchema, description: 'New token pair' })
  @ApiProblems('INVALID_REFRESH_TOKEN', 'REFRESH_TOKEN_REUSED', 'ACCOUNT_BLOCKED')
  refresh(@Body({ schema: RefreshSchema }) body: RefreshInput, @Req() req: Request) {
    return this.auth.refresh(body.refreshToken, req.ip, userAgentOf(req));
  }

  @Post('logout')
  @Public()
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke the presented session family' })
  async logout(@Body({ schema: LogoutSchema }) body: RefreshInput): Promise<void> {
    await this.auth.logout(body.refreshToken);
  }

  @Post('logout-all')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke every session of the current user' })
  async logoutAll(@CurrentUser() user: AuthUser): Promise<void> {
    await this.auth.logoutAll(user.id);
  }
}

function userAgentOf(req: Request): string | undefined {
  const value = req.headers['user-agent'];
  return typeof value === 'string' ? value : undefined;
}
