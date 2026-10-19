import { z } from 'zod';
import { MoneySchema } from '../../common/http/money.js';
import { OrderStatusSchema } from '../orders/orders.schemas.js';

export const StatsRangeQuerySchema = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});

export const TopProductsQuerySchema = StatsRangeQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(20).default(5),
  by: z.enum(['revenue', 'quantity']).default('revenue'),
});

export type StatsRangeQuery = z.output<typeof StatsRangeQuerySchema>;
export type TopProductsQuery = z.output<typeof TopProductsQuerySchema>;

export const StatsSummarySchema = z.object({
  from: z.string(),
  to: z.string(),
  currency: z.string(),
  revenue: MoneySchema,
  revenueOrders: z.number().int(),
  ordersCreated: z.number().int(),
  averageOrderValue: MoneySchema,
  newCustomers: z.number().int(),
  statusBreakdown: z.record(OrderStatusSchema, z.number().int()),
});

export const RevenuePointSchema = z.object({
  date: z.string(),
  revenue: MoneySchema,
  orders: z.number().int(),
});

export const RevenueSeriesSchema = z.object({
  from: z.string(),
  to: z.string(),
  currency: z.string(),
  granularity: z.literal('day'),
  points: z.array(RevenuePointSchema),
});

export const TopProductsSchema = z.object({
  from: z.string(),
  to: z.string(),
  currency: z.string(),
  data: z.array(
    z.object({
      productId: z.string(),
      name: z.string(),
      slug: z.string(),
      quantity: z.number().int(),
      revenue: MoneySchema,
    }),
  ),
});
