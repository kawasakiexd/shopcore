import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainException } from '../../common/errors/domain.exception.js';
import { uniqueSlug } from '../../common/utils/slugify.js';
import type { Env } from '../../config/env.schema.js';
import { CacheService } from '../../infra/cache/cache.service.js';
import { isUniqueViolation } from '../../infra/prisma/prisma-errors.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { toCategory } from './catalog.mapper.js';
import type { CreateCategoryInput, PatchCategoryInput } from './catalog.schemas.js';

const DEMO_CATEGORY_CAP = 20;
const COUNT_ACTIVE = { _count: { select: { products: { where: { status: 'ACTIVE' as const } } } } };

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  list() {
    return this.cache.getOrSet('catalog', 'categories:list', 30, async () => {
      const rows = await this.prisma.category.findMany({
        orderBy: [{ position: 'asc' }, { name: 'asc' }],
        include: COUNT_ACTIVE,
      });
      return { data: rows.map(toCategory) };
    });
  }

  async getBySlug(slug: string) {
    return this.cache.getOrSet('catalog', `categories:${slug}`, 30, async () => {
      const row = await this.prisma.category.findUnique({ where: { slug }, include: COUNT_ACTIVE });
      if (!row)
        throw new DomainException('RESOURCE_NOT_FOUND', 'Category not found.', {
          resource: 'Category',
        });
      return toCategory(row);
    });
  }

  async create(input: CreateCategoryInput) {
    await this.assertDemoCap();
    const slug = input.slug
      ? input.slug
      : await uniqueSlug(input.name, 80, async (candidate) =>
          Boolean(await this.prisma.category.findUnique({ where: { slug: candidate } })),
        );
    try {
      const created = await this.prisma.category.create({
        data: {
          name: input.name,
          slug,
          description: input.description ?? null,
          position: input.position ?? 0,
        },
        include: COUNT_ACTIVE,
      });
      await this.cache.bump('catalog');
      return toCategory(created);
    } catch (error) {
      if (isUniqueViolation(error, 'slug'))
        throw new DomainException('SLUG_TAKEN', 'Slug is already in use.');
      throw error;
    }
  }

  async patch(id: string, input: PatchCategoryInput) {
    const existing = await this.prisma.category.findUnique({ where: { id } });
    if (!existing)
      throw new DomainException('RESOURCE_NOT_FOUND', 'Category not found.', {
        resource: 'Category',
      });
    try {
      const updated = await this.prisma.category.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.slug !== undefined ? { slug: input.slug } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.position !== undefined ? { position: input.position } : {}),
        },
        include: COUNT_ACTIVE,
      });
      await this.cache.bump('catalog');
      return toCategory(updated);
    } catch (error) {
      if (isUniqueViolation(error, 'slug'))
        throw new DomainException('SLUG_TAKEN', 'Slug is already in use.');
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const existing = await this.prisma.category.findUnique({ where: { id } });
    if (!existing)
      throw new DomainException('RESOURCE_NOT_FOUND', 'Category not found.', {
        resource: 'Category',
      });
    const remaining = await this.prisma.product.count({
      where: { categoryId: id, status: { not: 'ARCHIVED' } },
    });
    if (remaining > 0) {
      throw new DomainException('CATEGORY_NOT_EMPTY', 'Category still has products.');
    }
    await this.prisma.category.delete({ where: { id } });
    await this.cache.bump('catalog');
  }

  private async assertDemoCap(): Promise<void> {
    if (!this.config.get('DEMO_MODE', { infer: true })) return;
    const count = await this.prisma.category.count();
    if (count >= DEMO_CATEGORY_CAP) {
      throw new DomainException('DEMO_LIMIT_REACHED', 'Demo category cap reached.');
    }
  }
}
