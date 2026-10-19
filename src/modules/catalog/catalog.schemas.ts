import { z } from 'zod';
import { MoneySchema } from '../../common/http/money.js';

export const CategoryRefSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
});

export const CategorySchema = CategoryRefSchema.extend({
  description: z.string().nullable(),
  position: z.number().int(),
  productCount: z.number().int(),
});

export const ProductImageSchema = z.object({
  id: z.string(),
  url: z.string(),
  alt: z.string().nullable(),
  position: z.number().int(),
});

export const ProductListItemSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  category: CategoryRefSchema,
  price: MoneySchema,
  stock: z.number().int(),
  inStock: z.boolean(),
  thumbnailUrl: z.string().nullable(),
  createdAt: z.string(),
});

export const ProductDetailSchema = ProductListItemSchema.extend({
  sku: z.string(),
  description: z.string(),
  images: z.array(ProductImageSchema),
  updatedAt: z.string(),
});

export const AdminProductSchema = ProductDetailSchema.extend({
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']),
  archivedAt: z.string().nullable(),
});

const SlugSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const CreateCategorySchema = z.strictObject({
  name: z.string().trim().min(1).max(60),
  slug: SlugSchema.max(80).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  position: z.number().int().optional(),
});

export const PatchCategorySchema = z.strictObject({
  name: z.string().trim().min(1).max(60).optional(),
  slug: SlugSchema.max(80).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  position: z.number().int().optional(),
});

export const ListProductsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    q: z.string().min(2).max(100).optional(),
    category: z.string().min(1).max(80).optional(),
    minPrice: z.coerce.number().int().min(0).optional(),
    maxPrice: z.coerce.number().int().min(0).optional(),
    inStock: z.stringbool().optional(),
    sort: z.enum(['newest', 'price_asc', 'price_desc', 'name_asc', 'name_desc']).default('newest'),
  })
  .superRefine((value, ctx) => {
    if (
      value.minPrice !== undefined &&
      value.maxPrice !== undefined &&
      value.minPrice > value.maxPrice
    ) {
      ctx.addIssue({ code: 'custom', path: ['minPrice'], message: 'minPrice must be ≤ maxPrice' });
    }
  });

export const AdminListProductsQuerySchema = ListProductsQuerySchema.extend({
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
});

export const CreateProductSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .min(1)
    .max(140)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
  sku: z.string().regex(/^[A-Z0-9-]{3,40}$/),
  description: z.string().min(1).max(5000),
  priceAmount: z.number().int().min(1).max(10_000_000),
  stock: z.number().int().min(0).max(100_000),
  categoryId: z.uuid(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional().default('DRAFT'),
});

export const PatchProductSchema = z.strictObject({
  name: z.string().trim().min(1).max(120).optional(),
  slug: z
    .string()
    .min(1)
    .max(140)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
  sku: z
    .string()
    .regex(/^[A-Z0-9-]{3,40}$/)
    .optional(),
  description: z.string().min(1).max(5000).optional(),
  priceAmount: z.number().int().min(1).max(10_000_000).optional(),
  stock: z.number().int().min(0).max(100_000).optional(),
  categoryId: z.uuid().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
});

export const UploadUrlSchema = z.strictObject({
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  contentLength: z.number().int().min(1).max(5_242_880),
});

export const AttachImageSchema = z.strictObject({
  key: z.string().min(1).max(300),
  alt: z.string().max(200).optional(),
});

export const PatchImageSchema = z.strictObject({
  alt: z.string().max(200).nullable().optional(),
  position: z.number().int().min(0).max(7).optional(),
});

export const UploadUrlResponseSchema = z.object({
  key: z.string(),
  uploadUrl: z.string(),
  method: z.literal('PUT'),
  headers: z.object({ 'Content-Type': z.string(), 'Content-Length': z.string() }),
  expiresAt: z.string(),
  maxBytes: z.number().int(),
});

export type CreateCategoryInput = z.output<typeof CreateCategorySchema>;
export type PatchCategoryInput = z.output<typeof PatchCategorySchema>;
export type ListProductsQuery = z.output<typeof ListProductsQuerySchema>;
export type AdminListProductsQuery = z.output<typeof AdminListProductsQuerySchema>;
export type CreateProductInput = z.output<typeof CreateProductSchema>;
export type PatchProductInput = z.output<typeof PatchProductSchema>;
export type UploadUrlInput = z.output<typeof UploadUrlSchema>;
export type AttachImageInput = z.output<typeof AttachImageSchema>;
export type PatchImageInput = z.output<typeof PatchImageSchema>;
