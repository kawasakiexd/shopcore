import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainException } from '../../common/errors/domain.exception.js';
import { paginate, skipTake } from '../../common/http/pagination.js';
import { uniqueSlug } from '../../common/utils/slugify.js';
import type { Env } from '../../config/env.schema.js';
import type { Prisma, ProductStatus } from '../../generated/prisma/client.js';
import { CacheService } from '../../infra/cache/cache.service.js';
import { isUniqueViolation } from '../../infra/prisma/prisma-errors.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { StorageService } from '../../infra/storage/storage.service.js';
import { toAdminProduct, toProductDetail, toProductListItem } from './catalog.mapper.js';
import type {
  AdminListProductsQuery,
  CreateProductInput,
  ListProductsQuery,
  PatchProductInput,
} from './catalog.schemas.js';

const DEMO_PRODUCT_CAP = 300;
const LIST_INCLUDE = {
  category: true,
  images: { orderBy: { position: 'asc' as const } },
};

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly storage: StorageService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  listPublic(query: ListProductsQuery) {
    const key = `products:list:${stableKey(query)}`;
    return this.cache.getOrSet('catalog', key, 30, () =>
      this.queryProducts(query, ['ACTIVE'], true),
    );
  }

  getPublicBySlug(slug: string) {
    return this.cache.getOrSet('catalog', `products:detail:${slug}`, 30, async () => {
      const product = await this.prisma.product.findFirst({
        where: { slug, status: 'ACTIVE' },
        include: LIST_INCLUDE,
      });
      if (!product) {
        throw new DomainException('RESOURCE_NOT_FOUND', 'Product not found.', {
          resource: 'Product',
        });
      }
      return toProductDetail(product, (key) => this.storage.publicUrl(key));
    });
  }

  listAdmin(query: AdminListProductsQuery) {
    const statuses: ProductStatus[] = query.status ? [query.status] : ['DRAFT', 'ACTIVE'];
    return this.queryProducts(query, statuses, false);
  }

  async getAdmin(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id }, include: LIST_INCLUDE });
    if (!product)
      throw new DomainException('RESOURCE_NOT_FOUND', 'Product not found.', {
        resource: 'Product',
      });
    return toAdminProduct(product, (key) => this.storage.publicUrl(key));
  }

  async create(input: CreateProductInput) {
    if (this.config.get('DEMO_MODE', { infer: true })) {
      const count = await this.prisma.product.count();
      if (count >= DEMO_PRODUCT_CAP) {
        throw new DomainException('DEMO_LIMIT_REACHED', 'Demo product cap reached.');
      }
    }
    await this.assertCategory(input.categoryId);
    const slug = input.slug
      ? input.slug
      : await uniqueSlug(input.name, 140, async (candidate) =>
          Boolean(await this.prisma.product.findUnique({ where: { slug: candidate } })),
        );
    try {
      const created = await this.prisma.product.create({
        data: {
          name: input.name,
          slug,
          sku: input.sku,
          description: input.description,
          priceAmount: input.priceAmount,
          currency: this.config.get('STORE_CURRENCY', { infer: true }),
          stock: input.stock,
          categoryId: input.categoryId,
          status: input.status,
        },
        include: LIST_INCLUDE,
      });
      await this.cache.bump('catalog');
      return toAdminProduct(created, (key) => this.storage.publicUrl(key));
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async patch(id: string, input: PatchProductInput) {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing)
      throw new DomainException('RESOURCE_NOT_FOUND', 'Product not found.', {
        resource: 'Product',
      });
    if (input.categoryId) await this.assertCategory(input.categoryId);
    const archivedAt =
      input.status === 'ARCHIVED' && existing.status !== 'ARCHIVED'
        ? new Date()
        : input.status && input.status !== 'ARCHIVED'
          ? null
          : undefined;
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const row = await tx.product.update({
          where: { id },
          data: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.slug !== undefined ? { slug: input.slug } : {}),
            ...(input.sku !== undefined ? { sku: input.sku } : {}),
            ...(input.description !== undefined ? { description: input.description } : {}),
            ...(input.priceAmount !== undefined ? { priceAmount: input.priceAmount } : {}),
            ...(input.stock !== undefined ? { stock: input.stock } : {}),
            ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
            ...(archivedAt !== undefined ? { archivedAt } : {}),
          },
          include: LIST_INCLUDE,
        });
        if (row.status === 'ARCHIVED') {
          await tx.cartItem.deleteMany({ where: { productId: id } });
        }
        return row;
      });
      await this.cache.bump('catalog');
      return toAdminProduct(updated, (key) => this.storage.publicUrl(key));
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async archive(id: string): Promise<void> {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing)
      throw new DomainException('RESOURCE_NOT_FOUND', 'Product not found.', {
        resource: 'Product',
      });
    await this.prisma.$transaction([
      this.prisma.product.update({
        where: { id },
        data: { status: 'ARCHIVED', archivedAt: new Date() },
      }),
      this.prisma.cartItem.deleteMany({ where: { productId: id } }),
    ]);
    await this.cache.bump('catalog');
  }

  async requireActive(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { images: { orderBy: { position: 'asc' }, take: 1 } },
    });
    if (!product)
      throw new DomainException('RESOURCE_NOT_FOUND', 'Product not found.', {
        resource: 'Product',
      });
    return product;
  }

  private async queryProducts(
    query: ListProductsQuery,
    statuses: ProductStatus[],
    publicMapper: boolean,
  ) {
    const where: Prisma.ProductWhereInput = { status: { in: statuses } };
    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { description: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    if (query.category) where.category = { slug: query.category };
    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      where.priceAmount = {
        ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}),
        ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}),
      };
    }
    if (query.inStock === true) where.stock = { gt: 0 };
    if (query.inStock === false) where.stock = 0;
    const orderBy = orderByFor(query.sort);
    const { skip, take } = skipTake(query.page, query.limit);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({ where, orderBy, skip, take, include: LIST_INCLUDE }),
    ]);
    const url = (key: string) => this.storage.publicUrl(key);
    const data = publicMapper
      ? rows.map((row) => toProductListItem(row, url))
      : rows.map((row) => toAdminProduct(row, url));
    return paginate(data, query.page, query.limit, total);
  }

  private async assertCategory(categoryId: string): Promise<void> {
    const category = await this.prisma.category.findUnique({ where: { id: categoryId } });
    if (!category)
      throw new DomainException('CATEGORY_NOT_FOUND', 'Referenced category does not exist.');
  }

  private rethrowUnique(error: unknown): never {
    if (isUniqueViolation(error, 'slug'))
      throw new DomainException('SLUG_TAKEN', 'Slug is already in use.');
    if (isUniqueViolation(error, 'sku'))
      throw new DomainException('SKU_TAKEN', 'SKU is already in use.');
    throw error;
  }
}

function orderByFor(sort: ListProductsQuery['sort']): Prisma.ProductOrderByWithRelationInput {
  if (sort === 'price_asc') return { priceAmount: 'asc' };
  if (sort === 'price_desc') return { priceAmount: 'desc' };
  if (sort === 'name_asc') return { name: 'asc' };
  if (sort === 'name_desc') return { name: 'desc' };
  return { createdAt: 'desc' };
}

function stableKey(query: object): string {
  const record = query as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const normalized: Record<string, unknown> = {};
  for (const key of keys) {
    if (record[key] !== undefined) normalized[key] = record[key];
  }
  return JSON.stringify(normalized);
}
