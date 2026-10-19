import { z } from 'zod';

export const PageMetaSchema = z.object({
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

export type PageMeta = z.infer<typeof PageMetaSchema>;

export type Paginated<T> = { data: T[]; meta: PageMeta };

export function toPage(page: number, limit: number, total: number): PageMeta {
  return {
    page,
    limit,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  };
}

export function paginate<T>(items: T[], page: number, limit: number, total: number): Paginated<T> {
  return { data: items, meta: toPage(page, limit, total) };
}

export function skipTake(page: number, limit: number): { skip: number; take: number } {
  return { skip: (page - 1) * limit, take: limit };
}
