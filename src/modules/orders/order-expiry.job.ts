import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type Stripe from 'stripe';
import { STRIPE } from '../../infra/stripe/stripe.constants.js';
import { OrdersService } from './orders.service.js';

@Injectable()
export class OrderExpiryJob {
  private readonly logger = new Logger(OrderExpiryJob.name);

  constructor(
    private readonly orders: OrdersService,
    @Inject(STRIPE) private readonly stripe: Stripe,
  ) {}

  @Cron('*/5 * * * *')
  async handle(): Promise<void> {
    const pending = await this.orders.findExpiredPending(new Date());
    for (const order of pending) {
      try {
        const payment = order.payments.find((item) => item.status === 'OPEN') ?? order.payments[0];
        if (!payment) {
          await this.orders.markExpired(order.id);
          continue;
        }
        const session = await this.stripe.checkout.sessions.retrieve(payment.stripeSessionId);
        const intent =
          typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent?.id;
        if (session.status === 'complete' && session.payment_status === 'paid') {
          await this.orders.markPaid(order.id, intent ?? null);
          continue;
        }
        if (session.status === 'open') {
          await this.stripe.checkout.sessions.expire(payment.stripeSessionId);
        }
        await this.orders.markExpired(order.id);
      } catch (error) {
        this.logger.warn(
          { err: error, orderId: order.id },
          'Expiry sweeper failed for order; expiring locally',
        );
        await this.orders.markExpired(order.id);
      }
    }
  }
}
