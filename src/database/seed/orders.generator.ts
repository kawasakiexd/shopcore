import { mulberry32, pickIndex, randomInt } from '../../common/utils/prng.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

type SeedUser = { id: string; email: string };
type SeedProduct = {
  id: string;
  name: string;
  slug: string;
  sku: string;
  priceAmount: number;
  images: { key: string }[];
};

const STATUSES = [
  ...Array.from({ length: 120 }, () => 'DELIVERED' as const),
  ...Array.from({ length: 30 }, () => 'SHIPPED' as const),
  ...Array.from({ length: 20 }, () => 'PAID' as const),
  ...Array.from({ length: 16 }, () => 'CANCELLED' as const),
  ...Array.from({ length: 14 }, () => 'EXPIRED' as const),
];

export async function generateHistoricalOrders(
  prisma: PrismaClient,
  input: { now: Date; users: SeedUser[]; products: SeedProduct[]; demoCustomerId: string },
): Promise<void> {
  const rand = mulberry32(20261015);
  const catalog = input.products;
  const customers = input.users.filter((user) => user.email !== 'admin@example.com');
  const statuses = shuffle(STATUSES, rand);

  for (let i = 0; i < statuses.length; i += 1) {
    const status = statuses[i]!;
    const createdAt = pickCreatedAt(input.now, rand, i, statuses.length);
    const userId = i < 8 ? input.demoCustomerId : customers[pickIndex(rand, customers.length)]!.id;
    const itemCount = randomInt(rand, 1, 4);
    const chosen: SeedProduct[] = [];
    while (chosen.length < itemCount) {
      const product = catalog[pickIndex(rand, catalog.length)]!;
      if (!chosen.some((row) => row.id === product.id)) chosen.push(product);
    }
    const items = chosen.map((product) => {
      const quantity = randomInt(rand, 1, 3);
      return {
        productId: product.id,
        productName: product.name,
        productSlug: product.slug,
        productSku: product.sku,
        imageKey: product.images[0]?.key ?? null,
        unitPriceAmount: product.priceAmount,
        quantity,
        lineTotalAmount: product.priceAmount * quantity,
      };
    });
    const totalAmount = items.reduce((sum, item) => sum + item.lineTotalAmount, 0);
    const paidAt = ['PAID', 'SHIPPED', 'DELIVERED'].includes(status)
      ? new Date(createdAt.getTime() + 20 * 60_000)
      : null;
    const shippedAt = ['SHIPPED', 'DELIVERED'].includes(status)
      ? new Date(createdAt.getTime() + 2 * 24 * 60 * 60_000)
      : null;
    const deliveredAt =
      status === 'DELIVERED' ? new Date(createdAt.getTime() + 5 * 24 * 60 * 60_000) : null;
    const cancelledAt = status === 'CANCELLED' ? new Date(createdAt.getTime() + 15 * 60_000) : null;
    const expiredAt = status === 'EXPIRED' ? new Date(createdAt.getTime() + 30 * 60_000) : null;

    const order = await prisma.order.create({
      data: {
        userId,
        status,
        currency: 'USD',
        subtotalAmount: totalAmount,
        totalAmount,
        shippingAddress: {
          fullName: 'Alex Rivera',
          line1: '12 Market Street',
          line2: null,
          city: 'Austin',
          postalCode: '78701',
          country: 'US',
          phone: '+15125550123',
        },
        expiresAt: new Date(createdAt.getTime() + 30 * 60_000),
        paidAt,
        shippedAt,
        deliveredAt,
        cancelledAt,
        expiredAt,
        createdAt,
        updatedAt: deliveredAt ?? shippedAt ?? paidAt ?? cancelledAt ?? expiredAt ?? createdAt,
        items: { create: items },
      },
    });

    await prisma.orderStatusChange.create({
      data: {
        orderId: order.id,
        fromStatus: null,
        toStatus: 'PENDING',
        actorType: 'CUSTOMER',
        actorUserId: userId,
        createdAt,
      },
    });
    if (status !== 'CANCELLED' && status !== 'EXPIRED') {
      await prisma.orderStatusChange.create({
        data: {
          orderId: order.id,
          fromStatus: 'PENDING',
          toStatus: 'PAID',
          actorType: 'SYSTEM',
          createdAt: paidAt ?? createdAt,
        },
      });
    }
    if (status === 'SHIPPED' || status === 'DELIVERED') {
      await prisma.orderStatusChange.create({
        data: {
          orderId: order.id,
          fromStatus: 'PAID',
          toStatus: 'SHIPPED',
          actorType: 'ADMIN',
          createdAt: shippedAt ?? createdAt,
        },
      });
    }
    if (status === 'DELIVERED') {
      await prisma.orderStatusChange.create({
        data: {
          orderId: order.id,
          fromStatus: 'SHIPPED',
          toStatus: 'DELIVERED',
          actorType: 'ADMIN',
          createdAt: deliveredAt ?? createdAt,
        },
      });
    }
    if (status === 'CANCELLED') {
      await prisma.orderStatusChange.create({
        data: {
          orderId: order.id,
          fromStatus: 'PENDING',
          toStatus: 'CANCELLED',
          actorType: 'CUSTOMER',
          actorUserId: userId,
          createdAt: cancelledAt ?? createdAt,
        },
      });
    }
    if (status === 'EXPIRED') {
      await prisma.orderStatusChange.create({
        data: {
          orderId: order.id,
          fromStatus: 'PENDING',
          toStatus: 'EXPIRED',
          actorType: 'SYSTEM',
          createdAt: expiredAt ?? createdAt,
        },
      });
    }
  }
}

function shuffle<T>(items: T[], rand: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const current = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = current;
  }
  return copy;
}

function pickCreatedAt(now: Date, rand: () => number, index: number, total: number): Date {
  const dayOffset = Math.floor((index / total) * 90);
  const fromEnd = 90 - dayOffset;
  const date = new Date(now.getTime() - fromEnd * 24 * 60 * 60_000);
  const weekendBump = date.getUTCDay() === 0 || date.getUTCDay() === 6 ? 0.3 : 0;
  date.setUTCHours(10 + Math.floor(rand() * 10), Math.floor(rand() * 60), 0, 0);
  if (rand() < weekendBump) date.setUTCDate(date.getUTCDate());
  return date;
}
