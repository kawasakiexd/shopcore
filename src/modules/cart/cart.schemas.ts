import { z } from 'zod';
import { MoneySchema } from '../../common/http/money.js';

export const SetCartItemSchema = z.strictObject({
  quantity: z.number().int().min(1).max(20),
});

export type SetCartItemInput = z.output<typeof SetCartItemSchema>;

export const CartItemSchema = z.object({
  product: z.object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    thumbnailUrl: z.string().nullable(),
    status: z.string(),
  }),
  quantity: z.number().int(),
  unitPrice: MoneySchema,
  lineTotal: MoneySchema,
  available: z.boolean(),
  availableStock: z.number().int(),
});

export const CartSchema = z.object({
  items: z.array(CartItemSchema),
  itemsCount: z.number().int(),
  subtotal: MoneySchema,
  updatedAt: z.string().nullable(),
});
