import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainException } from '../../common/errors/domain.exception.js';
import type { Env } from '../../config/env.schema.js';
import { CacheService } from '../../infra/cache/cache.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import {
  contentTypeMatchesKind,
  detectImageKind,
  extensionForContentType,
} from '../../infra/storage/image-signature.js';
import { StorageService } from '../../infra/storage/storage.service.js';
import { toProductImageDto } from './catalog.mapper.js';
import type { AttachImageInput, PatchImageInput, UploadUrlInput } from './catalog.schemas.js';
import { UploadQuotaService } from './upload-quota.service.js';

const MAX_IMAGES = 8;

@Injectable()
export class ProductImagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly cache: CacheService,
    private readonly quota: UploadQuotaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async createUploadUrl(productId: string, input: UploadUrlInput, ip: string) {
    await this.requireProduct(productId);
    const count = await this.prisma.productImage.count({ where: { productId } });
    if (count >= MAX_IMAGES) {
      throw new DomainException('IMAGE_LIMIT_REACHED', 'Product image limit reached.');
    }
    await this.quota.consume(ip);
    const ext = extensionForContentType(input.contentType);
    if (!ext) throw new DomainException('VALIDATION_FAILED', 'Unsupported image type.');
    const key = `uploads/products/${productId}/${randomUUID()}.${ext}`;
    const { uploadUrl, expiresAt } = await this.storage.presignPut(
      key,
      input.contentType,
      input.contentLength,
    );
    return {
      key,
      uploadUrl,
      method: 'PUT' as const,
      headers: { 'Content-Type': input.contentType, 'Content-Length': String(input.contentLength) },
      expiresAt: expiresAt.toISOString(),
      maxBytes: this.config.get('UPLOAD_MAX_BYTES', { infer: true }),
    };
  }

  async attach(productId: string, input: AttachImageInput) {
    await this.requireProduct(productId);
    const prefix = `uploads/products/${productId}/`;
    if (!input.key.startsWith(prefix)) {
      throw new DomainException('UPLOAD_INVALID', 'Uploaded object is invalid.');
    }
    const count = await this.prisma.productImage.count({ where: { productId } });
    if (count >= MAX_IMAGES) {
      throw new DomainException('IMAGE_LIMIT_REACHED', 'Product image limit reached.');
    }
    const head = await this.storage.head(input.key);
    if (!head) throw new DomainException('UPLOAD_NOT_FOUND', 'Uploaded object not found.');
    const maxBytes = this.config.get('UPLOAD_MAX_BYTES', { infer: true });
    if (!head.contentLength || head.contentLength > maxBytes) {
      throw new DomainException('UPLOAD_INVALID', 'Uploaded object is invalid.');
    }
    const bytes = await this.storage.readPrefix(input.key, 16);
    if (!bytes) throw new DomainException('UPLOAD_NOT_FOUND', 'Uploaded object not found.');
    const kind = detectImageKind(bytes);
    if (!kind || !head.contentType || !contentTypeMatchesKind(head.contentType, kind)) {
      throw new DomainException('UPLOAD_INVALID', 'Uploaded object is invalid.');
    }
    const created = await this.prisma.productImage.create({
      data: {
        productId,
        key: input.key,
        alt: input.alt ?? null,
        position: count,
        contentType: head.contentType,
        sizeBytes: head.contentLength,
      },
    });
    await this.cache.bump('catalog');
    return toProductImageDto(created, (key) => this.storage.publicUrl(key));
  }

  async patch(productId: string, imageId: string, input: PatchImageInput) {
    await this.requireProduct(productId);
    const images = await this.prisma.productImage.findMany({
      where: { productId },
      orderBy: { position: 'asc' },
    });
    const current = images.find((image) => image.id === imageId);
    if (!current)
      throw new DomainException('RESOURCE_NOT_FOUND', 'Image not found.', {
        resource: 'ProductImage',
      });

    const next = images.filter((image) => image.id !== imageId);
    const target =
      input.position === undefined ? next.length : Math.min(input.position, next.length);
    next.splice(target, 0, current);

    await this.prisma.$transaction(async (tx) => {
      for (const [index, image] of next.entries()) {
        await tx.productImage.update({
          where: { id: image.id },
          data: {
            position: index,
            ...(image.id === imageId && input.alt !== undefined ? { alt: input.alt } : {}),
          },
        });
      }
    });
    const updated = await this.prisma.productImage.findUniqueOrThrow({ where: { id: imageId } });
    await this.cache.bump('catalog');
    return toProductImageDto(updated, (key) => this.storage.publicUrl(key));
  }

  async remove(productId: string, imageId: string): Promise<void> {
    await this.requireProduct(productId);
    const image = await this.prisma.productImage.findFirst({ where: { id: imageId, productId } });
    if (!image)
      throw new DomainException('RESOURCE_NOT_FOUND', 'Image not found.', {
        resource: 'ProductImage',
      });
    await this.prisma.productImage.delete({ where: { id: imageId } });
    const remaining = await this.prisma.productImage.findMany({
      where: { productId },
      orderBy: { position: 'asc' },
    });
    await this.prisma.$transaction(
      remaining.map((row, index) =>
        this.prisma.productImage.update({ where: { id: row.id }, data: { position: index } }),
      ),
    );
    if (image.key.startsWith('uploads/')) {
      await this.storage.delete(image.key);
    }
    await this.cache.bump('catalog');
  }

  private async requireProduct(productId: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product)
      throw new DomainException('RESOURCE_NOT_FOUND', 'Product not found.', {
        resource: 'Product',
      });
    return product;
  }
}
