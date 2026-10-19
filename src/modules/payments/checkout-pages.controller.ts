import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/auth/public.decorator.js';
import { formatOrderNumber } from '../../common/http/order-number.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { CancelQuerySchema, CheckoutQuerySchema } from './payments.schemas.js';

@ApiTags('payments')
@Public()
@Controller('checkout')
export class CheckoutPagesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('success')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @ApiOperation({ summary: 'Stripe success redirect page' })
  async success(@Query({ schema: CheckoutQuerySchema }) query: { session_id?: string }) {
    let orderNumber = '';
    if (query.session_id) {
      const payment = await this.prisma.payment.findUnique({
        where: { stripeSessionId: query.session_id },
        select: { order: { select: { number: true } } },
      });
      if (payment) orderNumber = formatOrderNumber(payment.order.number);
    }
    const orderHtml = orderNumber ? `<p>Order ${escapeHtml(orderNumber)}</p>` : '';
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Payment received</title></head>
<body>
<h1>Payment received</h1>
<p>Payment received — your order will be marked paid within seconds.</p>
${orderHtml}
<p><a href="/docs">Back to API docs</a></p>
</body></html>`;
  }

  @Get('cancel')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @ApiOperation({ summary: 'Stripe cancel redirect page' })
  cancel(@Query({ schema: CancelQuerySchema }) query: { order_id?: string }) {
    const order = query.order_id ? escapeHtml(query.order_id) : '';
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Payment cancelled</title></head>
<body>
<h1>Payment cancelled</h1>
<p>Payment cancelled — the order stays pending until it expires.</p>
${order ? `<p>Order: ${order}</p>` : ''}
<p><a href="/docs">Back to API docs</a></p>
</body></html>`;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    if (char === '&') return '&amp;';
    if (char === '<') return '&lt;';
    if (char === '>') return '&gt;';
    if (char === '"') return '&quot;';
    return '&#39;';
  });
}
