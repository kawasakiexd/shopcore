import { z } from 'zod';

export const CheckoutQuerySchema = z.object({
  session_id: z.string().min(1).optional(),
});

export const CancelQuerySchema = z.object({
  order_id: z.uuid().optional(),
});

export const WebhookAckSchema = z.object({
  received: z.literal(true),
});
