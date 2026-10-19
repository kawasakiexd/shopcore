import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainException } from '../../common/errors/domain.exception.js';
import { roundHalfUp, toMoney } from '../../common/http/money.js';
import type { Env } from '../../config/env.schema.js';
import type { OrderStatus } from '../../generated/prisma/client.js';
import { CacheService } from '../../infra/cache/cache.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { StatsRangeQuery, TopProductsQuery } from './stats.schemas.js';

const STATUSES: OrderStatus[] = ['PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'EXPIRED'];

@Injectable()
export class StatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  summary(query: StatsRangeQuery) {
    const range = resolveRange(query.from, query.to);
    const currency = this.config.get('STORE_CURRENCY', { infer: true });
    return this.cache.getOrSet('stats', `summary:${range.from}:${range.to}`, 300, () =>
      this.loadSummary(range, currency),
    );
  }

  revenue(query: StatsRangeQuery) {
    const range = resolveRange(query.from, query.to);
    const currency = this.config.get('STORE_CURRENCY', { infer: true });
    return this.cache.getOrSet('stats', `revenue:${range.from}:${range.to}`, 300, () =>
      this.loadRevenue(range, currency),
    );
  }

  topProducts(query: TopProductsQuery) {
    const range = resolveRange(query.from, query.to);
    const currency = this.config.get('STORE_CURRENCY', { infer: true });
    return this.cache.getOrSet(
      'stats',
      `top:${range.from}:${range.to}:${query.limit}:${query.by}`,
      300,
      () => this.loadTop(range, currency, query.limit, query.by),
    );
  }

  private async loadSummary(range: { from: string; to: string }, currency: string) {
    const fromStart = utcDayStart(range.from);
    const toEnd = utcDayEnd(range.to);
    const [revenueRow] = await this.prisma.$queryRaw<Array<{ revenue: bigint; orders: bigint }>>`
      SELECT COALESCE(SUM(total_amount), 0)::bigint AS revenue, COUNT(*)::bigint AS orders
      FROM orders
      WHERE status IN ('PAID', 'SHIPPED', 'DELIVERED')
        AND paid_at IS NOT NULL
        AND paid_at >= ${fromStart}
        AND paid_at <= ${toEnd}
    `;
    const [createdRow] = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM orders WHERE created_at >= ${fromStart} AND created_at <= ${toEnd}
    `;
    const [customersRow] = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM users WHERE created_at >= ${fromStart} AND created_at <= ${toEnd}
    `;
    const statusRows = await this.prisma.$queryRaw<Array<{ status: OrderStatus; count: bigint }>>`
      SELECT status, COUNT(*)::bigint AS count
      FROM orders
      WHERE created_at >= ${fromStart} AND created_at <= ${toEnd}
      GROUP BY status
    `;
    const revenue = Number(revenueRow?.revenue ?? 0);
    const revenueOrders = Number(revenueRow?.orders ?? 0);
    const statusBreakdown = Object.fromEntries(STATUSES.map((status) => [status, 0])) as Record<
      OrderStatus,
      number
    >;
    for (const row of statusRows) statusBreakdown[row.status] = Number(row.count);
    const aov = revenueOrders === 0 ? 0 : roundHalfUp(revenue / revenueOrders);
    return {
      from: range.from,
      to: range.to,
      currency,
      revenue: toMoney(revenue, currency),
      revenueOrders,
      ordersCreated: Number(createdRow?.count ?? 0),
      averageOrderValue: toMoney(aov, currency),
      newCustomers: Number(customersRow?.count ?? 0),
      statusBreakdown,
    };
  }

  private async loadRevenue(range: { from: string; to: string }, currency: string) {
    const fromStart = utcDayStart(range.from);
    const toEnd = utcDayEnd(range.to);
    const rows = await this.prisma.$queryRaw<Array<{ day: Date; revenue: bigint; orders: bigint }>>`
      WITH days AS (
        SELECT generate_series(${fromStart}::timestamptz, ${toEnd}::timestamptz, interval '1 day')::date AS day
      ),
      agg AS (
        SELECT (paid_at AT TIME ZONE 'UTC')::date AS day,
               SUM(total_amount)::bigint AS revenue,
               COUNT(*)::bigint AS orders
        FROM orders
        WHERE status IN ('PAID', 'SHIPPED', 'DELIVERED')
          AND paid_at IS NOT NULL
          AND paid_at >= ${fromStart}
          AND paid_at <= ${toEnd}
        GROUP BY 1
      )
      SELECT d.day, COALESCE(a.revenue, 0) AS revenue, COALESCE(a.orders, 0) AS orders
      FROM days d
      LEFT JOIN agg a ON a.day = d.day
      ORDER BY d.day
    `;
    return {
      from: range.from,
      to: range.to,
      currency,
      granularity: 'day' as const,
      points: rows.map((row) => ({
        date: toIsoDate(row.day),
        revenue: toMoney(Number(row.revenue), currency),
        orders: Number(row.orders),
      })),
    };
  }

  private async loadTop(
    range: { from: string; to: string },
    currency: string,
    limit: number,
    by: 'revenue' | 'quantity',
  ) {
    const fromStart = utcDayStart(range.from);
    const toEnd = utcDayEnd(range.to);
    const rows =
      by === 'quantity'
        ? await this.prisma.$queryRaw<
            Array<{
              product_id: string;
              name: string;
              slug: string;
              quantity: bigint;
              revenue: bigint;
            }>
          >`
          SELECT oi.product_id, oi.product_name AS name, oi.product_slug AS slug,
                 SUM(oi.quantity)::bigint AS quantity,
                 SUM(oi.line_total_amount)::bigint AS revenue
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
          WHERE o.status IN ('PAID', 'SHIPPED', 'DELIVERED')
            AND o.paid_at IS NOT NULL
            AND o.paid_at >= ${fromStart}
            AND o.paid_at <= ${toEnd}
          GROUP BY oi.product_id, oi.product_name, oi.product_slug
          ORDER BY SUM(oi.quantity) DESC, SUM(oi.line_total_amount) DESC
          LIMIT ${limit}
        `
        : await this.prisma.$queryRaw<
            Array<{
              product_id: string;
              name: string;
              slug: string;
              quantity: bigint;
              revenue: bigint;
            }>
          >`
          SELECT oi.product_id, oi.product_name AS name, oi.product_slug AS slug,
                 SUM(oi.quantity)::bigint AS quantity,
                 SUM(oi.line_total_amount)::bigint AS revenue
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
          WHERE o.status IN ('PAID', 'SHIPPED', 'DELIVERED')
            AND o.paid_at IS NOT NULL
            AND o.paid_at >= ${fromStart}
            AND o.paid_at <= ${toEnd}
          GROUP BY oi.product_id, oi.product_name, oi.product_slug
          ORDER BY SUM(oi.line_total_amount) DESC, SUM(oi.quantity) DESC
          LIMIT ${limit}
        `;
    return {
      from: range.from,
      to: range.to,
      currency,
      data: rows.map((row) => ({
        productId: row.product_id,
        name: row.name,
        slug: row.slug,
        quantity: Number(row.quantity),
        revenue: toMoney(Number(row.revenue), currency),
      })),
    };
  }
}

function resolveRange(
  from: string | undefined,
  to: string | undefined,
): { from: string; to: string } {
  const today = new Date().toISOString().slice(0, 10);
  const end = to ?? today;
  const start = from ?? shiftIsoDate(end, -29);
  if (start > end) {
    throw new DomainException('VALIDATION_FAILED', 'from must be on or before to', {
      errors: [{ path: 'from', message: 'from must be on or before to' }],
    });
  }
  const span =
    (Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / 86_400_000 + 1;
  if (span > 366) {
    throw new DomainException('VALIDATION_FAILED', 'Date range cannot exceed 366 days', {
      errors: [{ path: 'from', message: 'Date range cannot exceed 366 days' }],
    });
  }
  return { from: start, to: end };
}

function utcDayStart(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function utcDayEnd(date: string): Date {
  return new Date(`${date}T23:59:59.999Z`);
}

function shiftIsoDate(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function toIsoDate(value: Date): string {
  return new Date(value).toISOString().slice(0, 10);
}
