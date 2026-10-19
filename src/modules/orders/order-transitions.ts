import { DomainException } from '../../common/errors/domain.exception.js';
import type { ActorType, OrderStatus, Prisma } from '../../generated/prisma/client.js';

const ALLOWED: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['PAID', 'CANCELLED', 'EXPIRED'],
  PAID: ['SHIPPED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
  EXPIRED: [],
};

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!ALLOWED[from].includes(to)) {
    throw new DomainException(
      'INVALID_STATUS_TRANSITION',
      'Order status transition is not allowed.',
      { from, to },
    );
  }
}

export async function applyTransition(
  tx: Prisma.TransactionClient,
  input: {
    orderId: string;
    from: OrderStatus;
    to: OrderStatus;
    actorType: ActorType;
    actorUserId?: string | null;
    note?: string | null;
    extra?: Prisma.OrderUpdateManyMutationInput;
  },
): Promise<void> {
  assertTransition(input.from, input.to);
  const result = await tx.order.updateMany({
    where: { id: input.orderId, status: input.from },
    data: { status: input.to, ...input.extra },
  });
  if (result.count === 0) {
    throw new DomainException(
      'INVALID_STATUS_TRANSITION',
      'Order status transition is not allowed.',
      {
        from: input.from,
        to: input.to,
      },
    );
  }
  await tx.orderStatusChange.create({
    data: {
      orderId: input.orderId,
      fromStatus: input.from,
      toStatus: input.to,
      actorType: input.actorType,
      actorUserId: input.actorUserId ?? null,
      note: input.note ?? null,
    },
  });
}
