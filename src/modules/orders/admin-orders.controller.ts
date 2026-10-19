import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { Roles } from '../../common/auth/roles.decorator.js';
import {
  ApiPaginatedResponse,
  ApiProblems,
  ApiZodResponse,
} from '../../common/http/api-docs.decorators.js';
import { UuidParamSchema } from '../../common/http/common.schemas.js';
import {
  AdminListOrdersQuerySchema,
  AdminOrderSchema,
  PatchOrderStatusSchema,
  type AdminListOrdersQuery,
  type PatchOrderStatusInput,
} from './orders.schemas.js';
import { OrdersService } from './orders.service.js';

@ApiTags('admin-orders')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @ApiOperation({ summary: 'Admin order list' })
  @ApiPaginatedResponse(AdminOrderSchema, 'Orders')
  list(@Query({ schema: AdminListOrdersQuerySchema }) query: AdminListOrdersQuery) {
    return this.orders.adminList(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Admin order detail' })
  @ApiZodResponse({ status: 200, schema: AdminOrderSchema, description: 'Order' })
  @ApiProblems('RESOURCE_NOT_FOUND')
  get(@Param('id', { schema: UuidParamSchema }) id: string) {
    return this.orders.adminGet(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Transition order status' })
  @ApiZodResponse({ status: 200, schema: AdminOrderSchema, description: 'Updated order' })
  @ApiProblems('RESOURCE_NOT_FOUND', 'INVALID_STATUS_TRANSITION', 'PAYMENT_IN_PROGRESS')
  patchStatus(
    @CurrentUser() actor: AuthUser,
    @Param('id', { schema: UuidParamSchema }) id: string,
    @Body({ schema: PatchOrderStatusSchema }) body: PatchOrderStatusInput,
  ) {
    return this.orders.adminPatchStatus(id, actor.id, body);
  }
}
