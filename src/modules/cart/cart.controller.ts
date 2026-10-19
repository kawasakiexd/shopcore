import { Body, Controller, Delete, Get, HttpCode, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { ApiProblems, ApiZodResponse } from '../../common/http/api-docs.decorators.js';
import { UuidParamSchema } from '../../common/http/common.schemas.js';
import { CartSchema, SetCartItemSchema, type SetCartItemInput } from './cart.schemas.js';
import { CartService } from './cart.service.js';

@ApiTags('cart')
@ApiBearerAuth()
@Controller('cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  @ApiOperation({ summary: 'Get the current cart' })
  @ApiZodResponse({ status: 200, schema: CartSchema, description: 'Cart' })
  get(@CurrentUser() user: AuthUser) {
    return this.cart.get(user.id);
  }

  @Put('items/:productId')
  @ApiOperation({ summary: 'Set cart line quantity' })
  @ApiZodResponse({ status: 200, schema: CartSchema, description: 'Cart' })
  @ApiProblems(
    'RESOURCE_NOT_FOUND',
    'PRODUCT_UNAVAILABLE',
    'INSUFFICIENT_STOCK',
    'CART_LIMIT_EXCEEDED',
  )
  setItem(
    @CurrentUser() user: AuthUser,
    @Param('productId', { schema: UuidParamSchema }) productId: string,
    @Body({ schema: SetCartItemSchema }) body: SetCartItemInput,
  ) {
    return this.cart.setItem(user.id, productId, body.quantity);
  }

  @Delete('items/:productId')
  @ApiOperation({ summary: 'Remove a cart line' })
  @ApiZodResponse({ status: 200, schema: CartSchema, description: 'Cart' })
  removeItem(
    @CurrentUser() user: AuthUser,
    @Param('productId', { schema: UuidParamSchema }) productId: string,
  ) {
    return this.cart.removeItem(user.id, productId);
  }

  @Delete()
  @HttpCode(204)
  @ApiOperation({ summary: 'Clear the cart' })
  clear(@CurrentUser() user: AuthUser) {
    return this.cart.clear(user.id);
  }
}
