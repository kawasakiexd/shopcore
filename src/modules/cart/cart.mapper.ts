import { toMoney } from '../../common/http/money.js';
import type { CartItem, Product, ProductImage } from '../../generated/prisma/client.js';

type Row = CartItem & { product: Product & { images: ProductImage[] } };

export function toCart(rows: Row[], publicUrl: (key: string) => string) {
  const items = rows.map((row) => {
    const thumb = row.product.images[0];
    const available = row.product.status === 'ACTIVE' && row.product.stock >= row.quantity;
    return {
      product: {
        id: row.product.id,
        slug: row.product.slug,
        name: row.product.name,
        thumbnailUrl: thumb ? publicUrl(thumb.key) : null,
        status: row.product.status,
      },
      quantity: row.quantity,
      unitPrice: toMoney(row.product.priceAmount, row.product.currency),
      lineTotal: toMoney(row.product.priceAmount * row.quantity, row.product.currency),
      available,
      availableStock: row.product.stock,
    };
  });
  const subtotalAmount = items.reduce((sum, item) => sum + item.lineTotal.amount, 0);
  const currency = rows[0]?.product.currency ?? 'USD';
  const updatedAt = rows.reduce<Date | null>((max, row) => {
    if (!max || row.updatedAt > max) return row.updatedAt;
    return max;
  }, null);
  return {
    items,
    itemsCount: items.length,
    subtotal: toMoney(subtotalAmount, currency),
    updatedAt: updatedAt?.toISOString() ?? null,
  };
}
