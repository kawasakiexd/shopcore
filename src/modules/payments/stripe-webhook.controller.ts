import { Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../common/auth/public.decorator.js';
import { StripeWebhookService } from './stripe-webhook.service.js';

@ApiTags('payments')
@Public()
@SkipThrottle({ default: true, strict: true })
@Controller('payments/stripe')
export class StripeWebhookController {
  constructor(private readonly webhooks: StripeWebhookService) {}

  @Post('webhook')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ) {
    const event = this.webhooks.constructEvent(req.rawBody ?? Buffer.alloc(0), signature);
    await this.webhooks.process(event);
    return { received: true };
  }
}
