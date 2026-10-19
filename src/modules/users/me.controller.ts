import { Body, Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { minutes } from '@nestjs/throttler';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { ApiProblems, ApiZodResponse } from '../../common/http/api-docs.decorators.js';
import { StrictThrottle } from '../../common/throttling/strict-throttle.decorator.js';
import {
  ChangePasswordSchema,
  UpdateMeSchema,
  UserProfileSchema,
  type ChangePasswordInput,
  type UpdateMeInput,
} from './users.schemas.js';
import { UsersService } from './users.service.js';

@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Current user profile' })
  @ApiZodResponse({ status: 200, schema: UserProfileSchema, description: 'Profile' })
  @ApiProblems('RESOURCE_NOT_FOUND')
  me(@CurrentUser() user: AuthUser) {
    return this.users.getProfile(user.id);
  }

  @Patch()
  @ApiOperation({ summary: 'Update display name' })
  @ApiZodResponse({ status: 200, schema: UserProfileSchema, description: 'Updated profile' })
  update(@CurrentUser() user: AuthUser, @Body({ schema: UpdateMeSchema }) body: UpdateMeInput) {
    return this.users.updateProfile(user.id, body);
  }

  @Post('password')
  @HttpCode(204)
  @StrictThrottle({ limit: 5, ttl: minutes(15) })
  @ApiOperation({ summary: 'Change password and revoke all sessions' })
  @ApiProblems('INVALID_CURRENT_PASSWORD', 'DEMO_PROTECTED_RESOURCE')
  async password(
    @CurrentUser() user: AuthUser,
    @Body({ schema: ChangePasswordSchema }) body: ChangePasswordInput,
  ): Promise<void> {
    await this.users.changePassword(user.id, body);
  }
}
