import { Module } from '@nestjs/common';
import { MailModule } from '../../infra/mail/mail.module.js';
import { StripeModule } from '../../infra/stripe/stripe.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { CheckoutController } from './checkout.controller.js';
import { CheckoutPagesController } from './checkout-pages.controller.js';
import { PaymentsService } from './payments.service.js';
import { StripeWebhookController } from './stripe-webhook.controller.js';
import { StripeWebhookService } from './stripe-webhook.service.js';

@Module({
  imports: [OrdersModule, StripeModule, MailModule],
  controllers: [CheckoutController, CheckoutPagesController, StripeWebhookController],
  providers: [PaymentsService, StripeWebhookService],
})
export class PaymentsModule {}
