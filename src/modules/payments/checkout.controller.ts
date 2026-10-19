import { Controller, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { minutes } from '@nestjs/throttler';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { ApiProblems, ApiZodResponse } from '../../common/http/api-docs.decorators.js';
import { UuidParamSchema } from '../../common/http/common.schemas.js';
import { StrictThrottle } from '../../common/throttling/strict-throttle.decorator.js';
import { CheckoutResponseSchema } from '../orders/orders.schemas.js';
import { PaymentsService } from './payments.service.js';

@ApiTags('payments')
@ApiBearerAuth()
@Controller('orders')
export class CheckoutController {
  constructor(private readonly payments: PaymentsService) {}

  @Post(':id/checkout')
  @HttpCode(200)
  @StrictThrottle({ limit: 10, ttl: minutes(1) })
  @ApiOperation({ summary: 'Create or reuse a Stripe Checkout session' })
  @ApiZodResponse({ status: 200, schema: CheckoutResponseSchema, description: 'Checkout session' })
  @ApiProblems('RESOURCE_NOT_FOUND', 'ORDER_NOT_PENDING', 'PAYMENT_PROVIDER_ERROR')
  checkout(@CurrentUser() user: AuthUser, @Param('id', { schema: UuidParamSchema }) id: string) {
    return this.payments.checkout(user.id, id);
  }
}
