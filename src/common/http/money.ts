import { z } from 'zod';

export const MoneySchema = z.object({
  amount: z.number().int(),
  currency: z.string(),
  formatted: z.string(),
});

export type Money = z.infer<typeof MoneySchema>;

export function formatMoney(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount / 100);
}

export function toMoney(amount: number, currency = 'USD'): Money {
  return { amount, currency, formatted: formatMoney(amount, currency) };
}

export function roundHalfUp(value: number): number {
  return Math.round(value);
}
