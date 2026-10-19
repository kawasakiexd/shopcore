import { Injectable } from '@nestjs/common';
import { DomainException } from '../../common/errors/domain.exception.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { StorageService } from '../../infra/storage/storage.service.js';
import { toCart } from './cart.mapper.js';

const CART_INCLUDE = {
  product: { include: { images: { orderBy: { position: 'asc' as const }, take: 1 } } },
};

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async get(userId: string) {
    const rows = await this.prisma.cartItem.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      include: CART_INCLUDE,
    });
    return toCart(rows, (key) => this.storage.publicUrl(key));
  }

  async setItem(userId: string, productId: string, quantity: number) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product)
      throw new DomainException('RESOURCE_NOT_FOUND', 'Product not found.', {
        resource: 'Product',
      });
    if (product.status !== 'ACTIVE') {
      throw new DomainException('PRODUCT_UNAVAILABLE', 'Product is not available for purchase.', {
        productIds: [productId],
      });
    }
    if (product.stock < quantity) {
      throw new DomainException(
        'INSUFFICIENT_STOCK',
        'Requested quantity exceeds available stock.',
        {
          available: product.stock,
        },
      );
    }
    const existing = await this.prisma.cartItem.findUnique({
      where: { userId_productId: { userId, productId } },
    });
    if (!existing) {
      const distinct = await this.prisma.cartItem.count({ where: { userId } });
      if (distinct >= 20) {
        throw new DomainException('CART_LIMIT_EXCEEDED', 'Cart item limit exceeded.');
      }
    }
    await this.prisma.cartItem.upsert({
      where: { userId_productId: { userId, productId } },
      update: { quantity },
      create: { userId, productId, quantity },
    });
    return this.get(userId);
  }

  async removeItem(userId: string, productId: string) {
    await this.prisma.cartItem.deleteMany({ where: { userId, productId } });
    return this.get(userId);
  }

  async clear(userId: string): Promise<void> {
    await this.prisma.cartItem.deleteMany({ where: { userId } });
  }
}
