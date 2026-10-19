import { AddressSchema } from '../../common/http/common.schemas.js';
import { toMoney } from '../../common/http/money.js';
import { formatOrderNumber } from '../../common/http/order-number.js';
import type {
  Order,
  OrderItem,
  OrderStatusChange,
  Payment,
  User,
} from '../../generated/prisma/client.js';

export type OrderWithItems = Order & { items: OrderItem[] };
export type AdminOrderRow = OrderWithItems & {
  user: User;
  statusChanges: OrderStatusChange[];
  payments: Payment[];
};

export function toOrder(order: OrderWithItems, publicUrl: (key: string) => string) {
  const address = AddressSchema.parse(order.shippingAddress);
  return {
    id: order.id,
    number: formatOrderNumber(order.number),
    status: order.status,
    items: order.items.map((item) => ({
      productId: item.productId,
      name: item.productName,
      slug: item.productSlug,
      sku: item.productSku,
      imageUrl: item.imageKey ? publicUrl(item.imageKey) : null,
      unitPrice: toMoney(item.unitPriceAmount, order.currency),
      quantity: item.quantity,
      lineTotal: toMoney(item.lineTotalAmount, order.currency),
    })),
    subtotal: toMoney(order.subtotalAmount, order.currency),
    total: toMoney(order.totalAmount, order.currency),
    shippingAddress: {
      ...address,
      line2: address.line2 ?? null,
      phone: address.phone ?? null,
    },
    note: order.note,
    trackingNumber: order.trackingNumber,
    expiresAt: order.expiresAt.toISOString(),
    paidAt: order.paidAt?.toISOString() ?? null,
    shippedAt: order.shippedAt?.toISOString() ?? null,
    deliveredAt: order.deliveredAt?.toISOString() ?? null,
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
    expiredAt: order.expiredAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

export function toAdminOrder(
  order: AdminOrderRow,
  publicUrl: (key: string) => string,
  options?: { includeExtras?: boolean },
) {
  const includeExtras = options?.includeExtras ?? true;
  return {
    ...toOrder(order, publicUrl),
    customer: { id: order.user.id, email: order.user.email, name: order.user.name },
    history: includeExtras
      ? order.statusChanges.map((change) => ({
          from: change.fromStatus,
          to: change.toStatus,
          actor: change.actorType,
          actorUserId: change.actorUserId,
          note: change.note,
          at: change.createdAt.toISOString(),
        }))
      : [],
    payments: includeExtras
      ? order.payments.map((payment) => ({
          id: payment.id,
          status: payment.status,
          amount: toMoney(payment.amount, payment.currency),
          stripeSessionId: payment.stripeSessionId,
          createdAt: payment.createdAt.toISOString(),
          succeededAt: payment.succeededAt?.toISOString() ?? null,
          refundedAt: payment.refundedAt?.toISOString() ?? null,
        }))
      : [],
  };
}
