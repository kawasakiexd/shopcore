import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import type { Env } from '../../config/env.schema.js';
import { STRIPE, STRIPE_API_VERSION } from './stripe.constants.js';

@Module({
  providers: [
    {
      provide: STRIPE,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new Stripe(config.get('STRIPE_SECRET_KEY', { infer: true }), {
          apiVersion: STRIPE_API_VERSION,
          maxNetworkRetries: 2,
          timeout: 10_000,
          appInfo: {
            name: 'ShopCore API',
            version: '1.0.0',
            url: 'https://github.com/shopcore/shopcore',
          },
        }),
    },
  ],
  exports: [STRIPE],
})
export class StripeModule {}
