import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/auth/roles.decorator.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import {
  ApiPaginatedResponse,
  ApiProblems,
  ApiZodResponse,
} from '../../common/http/api-docs.decorators.js';
import { UuidParamSchema } from '../../common/http/common.schemas.js';
import {
  AdminUserListQuerySchema,
  AdminUserSchema,
  PatchAdminUserSchema,
  type AdminUserListQuery,
  type PatchAdminUserInput,
} from './users.schemas.js';
import { UsersService } from './users.service.js';

@ApiTags('admin-users')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List users' })
  @ApiPaginatedResponse(AdminUserSchema, 'Users')
  list(@Query({ schema: AdminUserListQuerySchema }) query: AdminUserListQuery) {
    return this.users.adminList(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'User detail' })
  @ApiZodResponse({ status: 200, schema: AdminUserSchema, description: 'User' })
  @ApiProblems('RESOURCE_NOT_FOUND')
  get(@Param('id', { schema: UuidParamSchema }) id: string) {
    return this.users.adminGet(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Change role or blocked flag' })
  @ApiZodResponse({ status: 200, schema: AdminUserSchema, description: 'Updated user' })
  @ApiProblems('RESOURCE_NOT_FOUND', 'DEMO_PROTECTED_RESOURCE', 'CANNOT_MODIFY_SELF')
  patch(
    @CurrentUser() actor: AuthUser,
    @Param('id', { schema: UuidParamSchema }) id: string,
    @Body({ schema: PatchAdminUserSchema }) body: PatchAdminUserInput,
  ) {
    return this.users.adminPatch(actor.id, id, body);
  }
}
