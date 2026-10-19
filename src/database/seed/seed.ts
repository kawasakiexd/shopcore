import argon2 from 'argon2';
import type { PrismaClient } from '../../generated/prisma/client.js';
import {
  DEMO_ADMIN_EMAIL,
  DEMO_ADMIN_PASSWORD,
  DEMO_CUSTOMER_EMAIL,
  DEMO_CUSTOMER_PASSWORD,
} from '../../modules/demo/demo.constants.js';
import { SEED_CATEGORIES } from './data/categories.js';
import { SEED_PRODUCTS } from './data/products.js';
import { SEED_CUSTOMERS } from './data/users.js';
import { generateHistoricalOrders } from './orders.generator.js';

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function runSeed(prisma: PrismaClient, options: { now: Date }): Promise<void> {
  const adminHash = await argon2.hash(DEMO_ADMIN_PASSWORD, ARGON2_OPTIONS);
  const customerHash = await argon2.hash(DEMO_CUSTOMER_PASSWORD, ARGON2_OPTIONS);
  const fillerHash = await argon2.hash('UnusablePassw0rd!', ARGON2_OPTIONS);

  const categories = [];
  for (const category of SEED_CATEGORIES) {
    categories.push(
      await prisma.category.create({
        data: {
          name: category.name,
          slug: category.slug,
          description: category.description,
          position: category.position,
        },
      }),
    );
  }
  const categoryBySlug = new Map(categories.map((row) => [row.slug, row]));

  const products = [];
  for (const product of SEED_PRODUCTS) {
    const category = categoryBySlug.get(product.categorySlug);
    if (!category) throw new Error(`Missing category ${product.categorySlug}`);
    const created = await prisma.product.create({
      data: {
        categoryId: category.id,
        name: product.name,
        slug: product.slug,
        sku: product.sku,
        description: product.description,
        priceAmount: product.priceAmount,
        currency: 'USD',
        stock: product.stock,
        status: product.status,
        archivedAt: product.status === 'ARCHIVED' ? options.now : null,
        images: {
          create: {
            key: `seed/${product.slug}.webp`,
            alt: product.name,
            position: 0,
            contentType: 'image/webp',
            sizeBytes: 24_000,
          },
        },
      },
      include: { images: true },
    });
    products.push(created);
  }

  const admin = await prisma.user.create({
    data: {
      email: DEMO_ADMIN_EMAIL,
      passwordHash: adminHash,
      name: 'Demo Admin',
      role: 'ADMIN',
      isProtected: true,
    },
  });
  const demoCustomer = await prisma.user.create({
    data: {
      email: DEMO_CUSTOMER_EMAIL,
      passwordHash: customerHash,
      name: 'Demo Customer',
      role: 'CUSTOMER',
      isProtected: true,
    },
  });
  const extraUsers = [];
  for (const [first, last] of SEED_CUSTOMERS) {
    extraUsers.push(
      await prisma.user.create({
        data: {
          email: `${first.toLowerCase()}.${last.toLowerCase()}@example.com`,
          passwordHash: fillerHash,
          name: `${first} ${last}`,
          role: 'CUSTOMER',
        },
      }),
    );
  }

  void admin;
  await generateHistoricalOrders(prisma, {
    now: options.now,
    users: [demoCustomer, ...extraUsers],
    products,
    demoCustomerId: demoCustomer.id,
  });
}
