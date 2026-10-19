import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Stripe from 'stripe';
import { DomainException } from '../../common/errors/domain.exception.js';
import type { Env } from '../../config/env.schema.js';
import { CacheService } from '../../infra/cache/cache.service.js';
import { MailService } from '../../infra/mail/mail.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { STRIPE } from '../../infra/stripe/stripe.constants.js';
import { InventoryService } from '../orders/inventory.service.js';
import { applyTransition } from '../orders/order-transitions.js';

@Injectable()
export class StripeWebhookService {
  private readonly logger = new Logger(StripeWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly cache: CacheService,
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
    @Inject(STRIPE) private readonly stripe: Stripe,
  ) {}

  constructEvent(rawBody: Buffer, signature: string | undefined): Stripe.Event {
    if (!signature || !rawBody) {
      throw new DomainException('WEBHOOK_SIGNATURE_INVALID', 'Invalid webhook signature.');
    }
    try {
      return this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.config.get('STRIPE_WEBHOOK_SECRET', { infer: true }),
      );
    } catch {
      throw new DomainException('WEBHOOK_SIGNATURE_INVALID', 'Invalid webhook signature.');
    }
  }

  async process(event: Stripe.Event): Promise<void> {
    if (event.livemode) return;
    if (event.type !== 'checkout.session.completed' && event.type !== 'checkout.session.expired')
      return;

    const paidOrder: {
      current: {
        id: string;
        number: number;
        email: string;
        totalAmount: number;
        currency: string;
        items: { name: string; quantity: number; unitPriceAmount: number }[];
      } | null;
    } = { current: null };

    await this.prisma.$transaction(async (tx) => {
      const inserted = await tx.stripeEvent.createMany({
        data: {
          id: event.id,
          type: event.type,
          stripeCreatedAt: new Date(event.created * 1000),
        },
        skipDuplicates: true,
      });
      if (inserted.count === 0) return;

      const session = event.data.object;
      const orderId = session.metadata?.orderId ?? session.client_reference_id;
      if (!orderId) return;

      if (event.type === 'checkout.session.expired') {
        const order = await tx.order.findUnique({
          where: { id: orderId },
          include: { items: true },
        });
        if (!order || order.status !== 'PENDING') return;
        await applyTransition(tx, {
          orderId,
          from: 'PENDING',
          to: 'EXPIRED',
          actorType: 'SYSTEM',
          extra: { expiredAt: new Date() },
        });
        await tx.payment.updateMany({
          where: { orderId, status: 'OPEN' },
          data: { status: 'EXPIRED' },
        });
        await this.inventory.release(
          tx,
          order.items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
        );
        return;
      }

      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true, user: true },
      });
      const intentId =
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id;
      const amountOk =
        order &&
        session.payment_status === 'paid' &&
        session.amount_total === order.totalAmount &&
        session.currency?.toUpperCase() === order.currency &&
        order.status === 'PENDING';

      if (!amountOk) {
        await this.refundIfPossible(intentId, orderId, 'mismatch_or_not_pending');
        return;
      }

      await applyTransition(tx, {
        orderId,
        from: 'PENDING',
        to: 'PAID',
        actorType: 'SYSTEM',
        extra: { paidAt: new Date() },
      });
      await tx.payment.updateMany({
        where: { stripeSessionId: session.id },
        data: { status: 'SUCCEEDED', succeededAt: new Date(), stripePaymentIntentId: intentId },
      });
      paidOrder.current = {
        id: order.id,
        number: order.number,
        email: order.user.email,
        totalAmount: order.totalAmount,
        currency: order.currency,
        items: order.items.map((item) => ({
          name: item.productName,
          quantity: item.quantity,
          unitPriceAmount: item.unitPriceAmount,
        })),
      };
    });

    if (event.type === 'checkout.session.expired') {
      await this.cache.bump('catalog');
      await this.cache.bump('stats');
    }
    if (paidOrder.current) {
      const paid = paidOrder.current;
      await this.cache.bump('stats');
      this.logger.log({ orderId: paid.id, amount: paid.totalAmount }, 'order.paid');
      await this.mail.sendOrderConfirmation({
        orderId: paid.id,
        orderNumber: paid.number,
        email: paid.email,
        items: paid.items,
        totalAmount: paid.totalAmount,
        currency: paid.currency,
      });
    }
  }

  private async refundIfPossible(
    paymentIntentId: string | undefined,
    orderId: string,
    reason: string,
  ): Promise<void> {
    if (!paymentIntentId) return;
    try {
      await this.stripe.refunds.create(
        { payment_intent: paymentIntentId },
        { idempotencyKey: `refund:${paymentIntentId}` },
      );
      await this.prisma.payment.updateMany({
        where: { stripePaymentIntentId: paymentIntentId },
        data: { status: 'REFUNDED', refundedAt: new Date() },
      });
      this.logger.warn({ orderId, reason, paymentIntentId }, 'payment.refunded');
    } catch (error) {
      this.logger.error({ err: error, orderId, paymentIntentId }, 'Automatic refund failed');
      throw error;
    }
  }
}
