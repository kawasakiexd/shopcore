import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { minutes } from '@nestjs/throttler';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import {
  ApiPaginatedResponse,
  ApiProblems,
  ApiZodResponse,
} from '../../common/http/api-docs.decorators.js';
import { UuidParamSchema } from '../../common/http/common.schemas.js';
import { StrictThrottle } from '../../common/throttling/strict-throttle.decorator.js';
import {
  CancelOrderSchema,
  CreateOrderSchema,
  ListOrdersQuerySchema,
  OrderSchema,
  type CancelOrderInput,
  type CreateOrderInput,
  type ListOrdersQuery,
} from './orders.schemas.js';
import { OrdersService } from './orders.service.js';

@ApiTags('orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @StrictThrottle({ limit: 10, ttl: minutes(1) })
  @ApiOperation({ summary: 'Create an order from the cart' })
  @ApiZodResponse({ status: 201, schema: OrderSchema, description: 'Created order' })
  @ApiProblems('CART_EMPTY', 'OUT_OF_STOCK', 'PRODUCT_UNAVAILABLE')
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: CreateOrderSchema }) body: CreateOrderInput,
  ) {
    return this.orders.create(user.id, body, user.role === 'ADMIN' ? 'ADMIN' : 'CUSTOMER');
  }

  @Get()
  @ApiOperation({ summary: 'List own orders' })
  @ApiPaginatedResponse(OrderSchema, 'Orders')
  list(
    @CurrentUser() user: AuthUser,
    @Query({ schema: ListOrdersQuerySchema }) query: ListOrdersQuery,
  ) {
    return this.orders.listMine(user.id, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get own order' })
  @ApiZodResponse({ status: 200, schema: OrderSchema, description: 'Order' })
  @ApiProblems('RESOURCE_NOT_FOUND')
  get(@CurrentUser() user: AuthUser, @Param('id', { schema: UuidParamSchema }) id: string) {
    return this.orders.getMine(user.id, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancel a pending order' })
  @ApiZodResponse({ status: 200, schema: OrderSchema, description: 'Cancelled order' })
  @ApiProblems('RESOURCE_NOT_FOUND', 'INVALID_STATUS_TRANSITION', 'PAYMENT_IN_PROGRESS')
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: UuidParamSchema }) id: string,
    @Body({ schema: CancelOrderSchema }) body: CancelOrderInput,
  ) {
    return this.orders.cancelMine(user.id, id, body);
  }
}
