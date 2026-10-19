import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Stripe from 'stripe';
import { DomainException } from '../../common/errors/domain.exception.js';
import { paginate, skipTake } from '../../common/http/pagination.js';
import type { Env } from '../../config/env.schema.js';
import type { ActorType, Prisma } from '../../generated/prisma/client.js';
import { CacheService } from '../../infra/cache/cache.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { StorageService } from '../../infra/storage/storage.service.js';
import { STRIPE } from '../../infra/stripe/stripe.constants.js';
import { InventoryService } from './inventory.service.js';
import { applyTransition } from './order-transitions.js';
import { toAdminOrder, toOrder } from './orders.mapper.js';
import type {
  AdminListOrdersQuery,
  CancelOrderInput,
  CreateOrderInput,
  ListOrdersQuery,
  PatchOrderStatusInput,
} from './orders.schemas.js';

const ORDER_INCLUDE = {
  items: true,
  user: true,
  payments: { orderBy: { createdAt: 'desc' as const } },
  statusChanges: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.OrderInclude;

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly cache: CacheService,
    private readonly storage: StorageService,
    private readonly config: ConfigService<Env, true>,
    @Inject(STRIPE) private readonly stripe: Stripe,
  ) {}

  async create(userId: string, input: CreateOrderInput, actorType: ActorType) {
    const cart = await this.prisma.cartItem.findMany({
      where: { userId },
      include: { product: { include: { images: { orderBy: { position: 'asc' }, take: 1 } } } },
    });
    if (cart.length === 0) throw new DomainException('CART_EMPTY', 'Cart is empty.');
    const unavailable = cart
      .filter((row) => row.product.status !== 'ACTIVE')
      .map((row) => row.productId);
    if (unavailable.length > 0) {
      throw new DomainException('PRODUCT_UNAVAILABLE', 'Product is not available for purchase.', {
        productIds: unavailable,
      });
    }

    const ttlMinutes = this.config.get('ORDER_PAYMENT_TTL_MINUTES', { infer: true });
    const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);
    const currency = this.config.get('STORE_CURRENCY', { infer: true });

    const order = await this.prisma.$transaction(async (tx) => {
      await this.inventory.reserve(
        tx,
        cart.map((row) => ({
          productId: row.productId,
          name: row.product.name,
          quantity: row.quantity,
        })),
      );
      const items = cart.map((row) => ({
        productId: row.productId,
        productName: row.product.name,
        productSlug: row.product.slug,
        productSku: row.product.sku,
        imageKey: row.product.images[0]?.key ?? null,
        unitPriceAmount: row.product.priceAmount,
        quantity: row.quantity,
        lineTotalAmount: row.product.priceAmount * row.quantity,
      }));
      const totalAmount = items.reduce((sum, item) => sum + item.lineTotalAmount, 0);
      const created = await tx.order.create({
        data: {
          userId,
          status: 'PENDING',
          currency,
          subtotalAmount: totalAmount,
          totalAmount,
          shippingAddress: input.shippingAddress,
          note: input.note ?? null,
          expiresAt,
          items: { create: items },
          statusChanges: {
            create: {
              fromStatus: null,
              toStatus: 'PENDING',
              actorType,
              actorUserId: userId,
            },
          },
        },
        include: ORDER_INCLUDE,
      });
      await tx.cartItem.deleteMany({ where: { userId } });
      return created;
    });
    await this.cache.bump('catalog');
    return toOrder(order, (key) => this.storage.publicUrl(key));
  }

  async listMine(userId: string, query: ListOrdersQuery) {
    const where: Prisma.OrderWhereInput = {
      userId,
      ...(query.status ? { status: query.status } : {}),
    };
    const { skip, take } = skipTake(query.page, query.limit);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: ORDER_INCLUDE,
      }),
    ]);
    return paginate(
      rows.map((row) => toOrder(row, (key) => this.storage.publicUrl(key))),
      query.page,
      query.limit,
      total,
    );
  }

  async getMine(userId: string, id: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, userId },
      include: ORDER_INCLUDE,
    });
    if (!order)
      throw new DomainException('RESOURCE_NOT_FOUND', 'Order not found.', { resource: 'Order' });
    return toOrder(order, (key) => this.storage.publicUrl(key));
  }

  async cancelMine(userId: string, id: string, input: CancelOrderInput) {
    const order = await this.prisma.order.findFirst({
      where: { id, userId },
      include: ORDER_INCLUDE,
    });
    if (!order)
      throw new DomainException('RESOURCE_NOT_FOUND', 'Order not found.', { resource: 'Order' });
    return this.cancelPending(order.id, 'CUSTOMER', userId, input.reason);
  }

  async adminList(query: AdminListOrdersQuery) {
    const where: Prisma.OrderWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.userId) where.userId = query.userId;
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: utcDayStart(query.from) } : {}),
        ...(query.to ? { lte: utcDayEnd(query.to) } : {}),
      };
    }
    if (query.q) {
      const numeric = query.q.replace(/^SC-/i, '');
      if (/^\d+$/.test(numeric)) {
        where.OR = [
          { number: Number(numeric) },
          { user: { email: { contains: query.q, mode: 'insensitive' } } },
        ];
      } else {
        where.user = { email: { contains: query.q, mode: 'insensitive' } };
      }
    }
    const orderBy = adminSort(query.sort);
    const { skip, take } = skipTake(query.page, query.limit);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({ where, orderBy, skip, take, include: ORDER_INCLUDE }),
    ]);
    return paginate(
      rows.map((row) =>
        toAdminOrder(row, (key) => this.storage.publicUrl(key), { includeExtras: false }),
      ),
      query.page,
      query.limit,
      total,
    );
  }

  async adminGet(id: string) {
    const order = await this.require(id);
    return toAdminOrder(order, (key) => this.storage.publicUrl(key));
  }

  async adminPatchStatus(id: string, actorId: string, input: PatchOrderStatusInput) {
    await this.require(id);
    if (input.status === 'CANCELLED') {
      return this.cancelPending(id, 'ADMIN', actorId, input.note);
    }
    const extra =
      input.status === 'SHIPPED'
        ? { shippedAt: new Date(), trackingNumber: input.trackingNumber ?? undefined }
        : { deliveredAt: new Date() };
    const from = input.status === 'SHIPPED' ? 'PAID' : 'SHIPPED';
    const updated = await this.prisma.$transaction(async (tx) => {
      await applyTransition(tx, {
        orderId: id,
        from,
        to: input.status,
        actorType: 'ADMIN',
        actorUserId: actorId,
        note: input.note,
        extra,
      });
      return tx.order.findUniqueOrThrow({ where: { id }, include: ORDER_INCLUDE });
    });
    await this.cache.bump('stats');
    return toAdminOrder(updated, (key) => this.storage.publicUrl(key));
  }

  async markPaid(orderId: string, paymentIntentId: string | null): Promise<boolean> {
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        await applyTransition(tx, {
          orderId,
          from: 'PENDING',
          to: 'PAID',
          actorType: 'SYSTEM',
          extra: { paidAt: new Date() },
        });
        await tx.payment.updateMany({
          where: { orderId, status: 'OPEN' },
          data: {
            status: 'SUCCEEDED',
            succeededAt: new Date(),
            stripePaymentIntentId: paymentIntentId,
          },
        });
        return tx.order.findUniqueOrThrow({
          where: { id: orderId },
          include: { user: true, items: true },
        });
      });
      await this.cache.bump('stats');
      this.logger.log({ orderId, amount: updated.totalAmount }, 'order.paid');
      return true;
    } catch (error) {
      if (error instanceof DomainException && error.code === 'INVALID_STATUS_TRANSITION')
        return false;
      throw error;
    }
  }

  async markExpired(orderId: string): Promise<boolean> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const order = await tx.order.findUnique({
          where: { id: orderId },
          include: { items: true },
        });
        if (!order || order.status !== 'PENDING') return;
        await applyTransition(tx, {
          orderId,
          from: 'PENDING',
          to: 'EXPIRED',
          actorType: 'SYSTEM',
          extra: { expiredAt: new Date() },
        });
        await tx.payment.updateMany({
          where: { orderId, status: 'OPEN' },
          data: { status: 'EXPIRED' },
        });
        await this.inventory.release(
          tx,
          order.items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
        );
      });
      await this.cache.bump('catalog');
      await this.cache.bump('stats');
      return true;
    } catch (error) {
      if (error instanceof DomainException && error.code === 'INVALID_STATUS_TRANSITION')
        return false;
      throw error;
    }
  }

  async require(id: string) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
    if (!order)
      throw new DomainException('RESOURCE_NOT_FOUND', 'Order not found.', { resource: 'Order' });
    return order;
  }

  async requireOwned(userId: string, id: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, userId },
      include: ORDER_INCLUDE,
    });
    if (!order)
      throw new DomainException('RESOURCE_NOT_FOUND', 'Order not found.', { resource: 'Order' });
    return order;
  }

  async findExpiredPending(now: Date) {
    return this.prisma.order.findMany({
      where: { status: 'PENDING', expiresAt: { lt: new Date(now.getTime() - 2 * 60_000) } },
      include: { payments: true, items: true },
    });
  }

  async expireOpenSessionOrThrow(orderId: string): Promise<void> {
    const open = await this.prisma.payment.findFirst({
      where: { orderId, status: 'OPEN' },
      orderBy: { createdAt: 'desc' },
    });
    if (!open) return;
    try {
      const session = await this.stripe.checkout.sessions.retrieve(open.stripeSessionId);
      if (session.status === 'complete' && session.payment_status === 'paid') {
        throw new DomainException('PAYMENT_IN_PROGRESS', 'Payment is already being completed.');
      }
      if (session.status === 'open') {
        await this.stripe.checkout.sessions.expire(open.stripeSessionId);
      }
    } catch (error) {
      if (error instanceof DomainException) throw error;
      this.logger.warn({ err: error, orderId }, 'Failed to expire Stripe session');
    }
  }

  private async cancelPending(
    orderId: string,
    actorType: ActorType,
    actorUserId: string,
    note?: string,
  ) {
    const existing = await this.require(orderId);
    if (existing.status !== 'PENDING') {
      throw new DomainException(
        'INVALID_STATUS_TRANSITION',
        'Order status transition is not allowed.',
        {
          from: existing.status,
          to: 'CANCELLED',
        },
      );
    }
    await this.expireOpenSessionOrThrow(orderId);
    const updated = await this.prisma.$transaction(async (tx) => {
      await applyTransition(tx, {
        orderId,
        from: 'PENDING',
        to: 'CANCELLED',
        actorType,
        actorUserId,
        note,
        extra: { cancelledAt: new Date() },
      });
      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: ORDER_INCLUDE,
      });
      await this.inventory.release(
        tx,
        order.items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
      );
      return order;
    });
    await this.cache.bump('catalog');
    await this.cache.bump('stats');
    return actorType === 'ADMIN'
      ? toAdminOrder(updated, (key) => this.storage.publicUrl(key))
      : toOrder(updated, (key) => this.storage.publicUrl(key));
  }
}

function utcDayStart(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function utcDayEnd(date: string): Date {
  return new Date(`${date}T23:59:59.999Z`);
}

function adminSort(sort: AdminListOrdersQuery['sort']): Prisma.OrderOrderByWithRelationInput {
  if (sort === 'oldest') return { createdAt: 'asc' };
  if (sort === 'total_desc') return { totalAmount: 'desc' };
  if (sort === 'total_asc') return { totalAmount: 'asc' };
  return { createdAt: 'desc' };
}
