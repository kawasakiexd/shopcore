import { z } from 'zod';

export const UuidParamSchema = z.uuid().meta({
  description: 'Resource id (UUID v7)',
  example: '01929b7e-5a3e-7c55-9a43-2f0a3b1c9e77',
});

export const SlugParamSchema = z
  .string()
  .min(1)
  .max(140)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .meta({ description: 'URL slug', example: 'aria-anc-headphones' });

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1).meta({ example: 1 }),
  limit: z.coerce.number().int().min(1).max(100).default(20).meta({ example: 20 }),
});

export type PaginationQuery = z.output<typeof PaginationQuerySchema>;

export const DateRangeQuerySchema = z
  .object({
    from: z.iso.date().optional().meta({ example: '2026-09-19' }),
    to: z.iso.date().optional().meta({ example: '2026-10-19' }),
  })
  .superRefine((value, ctx) => {
    if (value.from && value.to && value.from > value.to) {
      ctx.addIssue({ code: 'custom', path: ['from'], message: 'from must be on or before to' });
    }
  });

export const AddressSchema = z.strictObject({
  fullName: z.string().trim().min(1).max(100).meta({ example: 'Alex Rivera' }),
  line1: z.string().trim().min(1).max(200).meta({ example: '12 Market Street' }),
  line2: z.string().trim().max(200).nullable().optional().meta({ example: 'Apt 4B' }),
  city: z.string().trim().min(1).max(100).meta({ example: 'Austin' }),
  postalCode: z.string().trim().min(1).max(20).meta({ example: '78701' }),
  country: z
    .string()
    .trim()
    .length(2)
    .regex(/^[A-Z]{2}$/)
    .meta({ example: 'US' }),
  phone: z
    .string()
    .regex(/^\+?[0-9 ()-]{6,20}$/)
    .nullable()
    .optional()
    .meta({ example: '+15125550123' }),
});

export type Address = z.output<typeof AddressSchema>;
