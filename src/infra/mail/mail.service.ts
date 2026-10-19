import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { formatOrderNumber } from '../../common/http/order-number.js';
import type { Env } from '../../config/env.schema.js';
import { orderConfirmationHtml, orderConfirmationText } from './order-confirmation.template.js';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend | null;
  private readonly from: string;
  private readonly allowlist: string[];
  private readonly demoMode: boolean;

  constructor(config: ConfigService<Env, true>) {
    const apiKey = config.get('RESEND_API_KEY', { infer: true });
    this.resend = apiKey ? new Resend(apiKey) : null;
    this.from = config.get('EMAIL_FROM', { infer: true });
    this.allowlist = config
      .get('EMAIL_ALLOWLIST', { infer: true })
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
    this.demoMode = config.get('DEMO_MODE', { infer: true });
  }

  async sendOrderConfirmation(input: {
    orderId: string;
    orderNumber: number;
    email: string;
    items: { name: string; quantity: number; unitPriceAmount: number }[];
    totalAmount: number;
    currency: string;
  }): Promise<void> {
    const number = formatOrderNumber(input.orderNumber);
    const html = orderConfirmationHtml({
      orderNumber: number,
      items: input.items,
      totalAmount: input.totalAmount,
      currency: input.currency,
    });
    const text = orderConfirmationText({
      orderNumber: number,
      items: input.items,
      totalAmount: input.totalAmount,
      currency: input.currency,
    });

    if (
      this.demoMode &&
      this.allowlist.length > 0 &&
      !this.allowlist.includes(input.email.toLowerCase())
    ) {
      this.logger.log(
        { email: input.email, orderId: input.orderId },
        'Order email suppressed by demo allowlist',
      );
      return;
    }
    if (this.demoMode && this.allowlist.length === 0) {
      this.logger.log(
        { email: input.email, orderId: input.orderId },
        'Order email suppressed (empty allowlist)',
      );
      return;
    }
    if (!this.resend) {
      this.logger.log(
        { email: input.email, orderId: input.orderId },
        'Order email logged (Resend disabled)',
      );
      return;
    }

    const { error } = await this.resend.emails.send(
      {
        from: this.from,
        to: [input.email],
        subject: `ShopCore order ${number}`,
        html,
        text,
      },
      { idempotencyKey: `order-paid/${input.orderId}` },
    );
    if (error) {
      this.logger.warn({ err: error, orderId: input.orderId }, 'Failed to send order confirmation');
    }
  }
}
