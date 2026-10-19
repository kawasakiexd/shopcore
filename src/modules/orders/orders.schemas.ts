import { z } from 'zod';
import { AddressSchema } from '../../common/http/common.schemas.js';
import { MoneySchema } from '../../common/http/money.js';

export const OrderStatusSchema = z.enum([
  'PENDING',
  'PAID',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'EXPIRED',
]);

export const CreateOrderSchema = z.strictObject({
  shippingAddress: AddressSchema,
  note: z.string().max(500).optional(),
});

export type CreateOrderInput = z.output<typeof CreateOrderSchema>;

export const CancelOrderSchema = z.strictObject({
  reason: z.string().max(200).optional(),
});

export type CancelOrderInput = z.output<typeof CancelOrderSchema>;

export const ListOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: OrderStatusSchema.optional(),
});

export type ListOrdersQuery = z.output<typeof ListOrdersQuerySchema>;

export const AdminListOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: OrderStatusSchema.optional(),
  q: z.string().min(1).max(100).optional(),
  userId: z.uuid().optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  sort: z.enum(['newest', 'oldest', 'total_desc', 'total_asc']).default('newest'),
});

export type AdminListOrdersQuery = z.output<typeof AdminListOrdersQuerySchema>;

export const PatchOrderStatusSchema = z
  .strictObject({
    status: z.enum(['SHIPPED', 'DELIVERED', 'CANCELLED']),
    trackingNumber: z.string().min(1).max(64).optional(),
    note: z.string().max(500).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.trackingNumber && value.status !== 'SHIPPED') {
      ctx.addIssue({
        code: 'custom',
        path: ['trackingNumber'],
        message: 'trackingNumber is only allowed when status is SHIPPED',
      });
    }
  });

export type PatchOrderStatusInput = z.output<typeof PatchOrderStatusSchema>;

export const OrderItemSchema = z.object({
  productId: z.string(),
  name: z.string(),
  slug: z.string(),
  sku: z.string(),
  imageUrl: z.string().nullable(),
  unitPrice: MoneySchema,
  quantity: z.number().int(),
  lineTotal: MoneySchema,
});

export const OrderSchema = z.object({
  id: z.string(),
  number: z.string(),
  status: OrderStatusSchema,
  items: z.array(OrderItemSchema),
  subtotal: MoneySchema,
  total: MoneySchema,
  shippingAddress: AddressSchema,
  note: z.string().nullable(),
  trackingNumber: z.string().nullable(),
  expiresAt: z.string(),
  paidAt: z.string().nullable(),
  shippedAt: z.string().nullable(),
  deliveredAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  expiredAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const OrderStatusChangeSchema = z.object({
  from: OrderStatusSchema.nullable(),
  to: OrderStatusSchema,
  actor: z.enum(['SYSTEM', 'CUSTOMER', 'ADMIN']),
  actorUserId: z.string().nullable(),
  note: z.string().nullable(),
  at: z.string(),
});

export const PaymentSummarySchema = z.object({
  id: z.string(),
  status: z.enum(['OPEN', 'SUCCEEDED', 'EXPIRED', 'REFUNDED']),
  amount: MoneySchema,
  stripeSessionId: z.string(),
  createdAt: z.string(),
  succeededAt: z.string().nullable(),
  refundedAt: z.string().nullable(),
});

export const AdminOrderSchema = OrderSchema.extend({
  customer: z.object({ id: z.string(), email: z.string(), name: z.string() }),
  history: z.array(OrderStatusChangeSchema),
  payments: z.array(PaymentSummarySchema),
});

export const CheckoutResponseSchema = z.object({
  orderId: z.string(),
  sessionId: z.string(),
  checkoutUrl: z.string(),
  expiresAt: z.string(),
});
