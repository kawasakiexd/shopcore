import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Stripe from 'stripe';
import { DomainException } from '../../common/errors/domain.exception.js';
import type { Env } from '../../config/env.schema.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { STRIPE } from '../../infra/stripe/stripe.constants.js';
import { OrdersService } from '../orders/orders.service.js';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly config: ConfigService<Env, true>,
    @Inject(STRIPE) private readonly stripe: Stripe,
  ) {}

  async checkout(userId: string, orderId: string) {
    const order = await this.orders.requireOwned(userId, orderId);
    if (order.status !== 'PENDING') {
      throw new DomainException('ORDER_NOT_PENDING', 'Order is not awaiting payment.');
    }

    const existing = await this.prisma.payment.findFirst({
      where: { orderId, status: 'OPEN', expiresAt: { gt: new Date() }, checkoutUrl: { not: null } },
      orderBy: { createdAt: 'desc' },
    });
    if (existing?.checkoutUrl) {
      return {
        orderId,
        sessionId: existing.stripeSessionId,
        checkoutUrl: existing.checkoutUrl,
        expiresAt: existing.expiresAt.toISOString(),
      };
    }

    const now = Date.now();
    const minExpiry = now + 30 * 60_000;
    const maxExpiry = now + 24 * 60 * 60_000;
    const expiresAtMs = Math.min(Math.max(order.expiresAt.getTime(), minExpiry), maxExpiry);
    const expiresAt = new Date(expiresAtMs);
    const publicUrl = this.config.get('PUBLIC_API_URL', { infer: true });
    const attempt = await this.prisma.payment.count({ where: { orderId } });
    const idempotencyKey =
      attempt === 0 ? `checkout-session:${orderId}` : `checkout-session:${orderId}:${attempt}`;

    let session: Stripe.Checkout.Session;
    try {
      session = await this.stripe.checkout.sessions.create(
        {
          mode: 'payment',
          allowed_payment_method_types: ['card'],
          client_reference_id: order.id,
          metadata: { orderId: order.id },
          success_url: `${publicUrl}/v1/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${publicUrl}/v1/checkout/cancel?order_id=${order.id}`,
          expires_at: Math.floor(expiresAtMs / 1000),
          line_items: order.items.map((item) => ({
            quantity: item.quantity,
            price_data: {
              currency: order.currency.toLowerCase(),
              unit_amount: item.unitPriceAmount,
              product_data: { name: item.productName },
            },
          })),
        },
        { idempotencyKey },
      );
    } catch {
      throw new DomainException('PAYMENT_PROVIDER_ERROR', 'Payment provider error.');
    }

    if (!session.url) {
      throw new DomainException('PAYMENT_PROVIDER_ERROR', 'Payment provider error.');
    }

    await this.prisma.$transaction([
      this.prisma.payment.create({
        data: {
          orderId,
          status: 'OPEN',
          stripeSessionId: session.id,
          amount: order.totalAmount,
          currency: order.currency,
          checkoutUrl: session.url,
          expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : expiresAt,
        },
      }),
      this.prisma.order.update({
        where: { id: orderId },
        data: { expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : expiresAt },
      }),
    ]);

    return {
      orderId,
      sessionId: session.id,
      checkoutUrl: session.url,
      expiresAt: (session.expires_at
        ? new Date(session.expires_at * 1000)
        : expiresAt
      ).toISOString(),
    };
  }
}
