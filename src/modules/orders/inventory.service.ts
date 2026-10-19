import { Injectable } from '@nestjs/common';
import { DomainException } from '../../common/errors/domain.exception.js';
import type { Prisma } from '../../generated/prisma/client.js';

type Line = { productId: string; name: string; quantity: number };

@Injectable()
export class InventoryService {
  async reserve(tx: Prisma.TransactionClient, lines: Line[]): Promise<void> {
    const sorted = [...lines].sort((a, b) => a.productId.localeCompare(b.productId));
    const short: { productId: string; name: string; requested: number; available: number }[] = [];
    for (const line of sorted) {
      const updated = await tx.$executeRaw`
        UPDATE products
        SET stock = stock - ${line.quantity}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${line.productId}::uuid AND status = 'ACTIVE' AND stock >= ${line.quantity}
      `;
      if (updated === 0) {
        const product = await tx.product.findUnique({ where: { id: line.productId } });
        short.push({
          productId: line.productId,
          name: line.name,
          requested: line.quantity,
          available: product?.status === 'ACTIVE' ? product.stock : 0,
        });
      }
    }
    if (short.length > 0) {
      throw new DomainException(
        'OUT_OF_STOCK',
        `${short.length} item${short.length === 1 ? '' : 's'} in your cart ${short.length === 1 ? 'is' : 'are'} not available in the requested quantity.`,
        { items: short },
      );
    }
  }

  async release(
    tx: Prisma.TransactionClient,
    lines: { productId: string; quantity: number }[],
  ): Promise<void> {
    const sorted = [...lines].sort((a, b) => a.productId.localeCompare(b.productId));
    for (const line of sorted) {
      await tx.$executeRaw`
        UPDATE products
        SET stock = stock + ${line.quantity}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${line.productId}::uuid
      `;
    }
  }
}
