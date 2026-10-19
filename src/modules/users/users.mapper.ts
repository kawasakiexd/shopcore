import type { User } from '../../generated/prisma/client.js';
import type { AdminUser, UserProfile } from './users.schemas.js';

export function toUserProfile(user: User): UserProfile {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}

export function toAdminUser(
  user: User & { _count?: { orders: number }; ordersCount?: number },
): AdminUser {
  return {
    ...toUserProfile(user),
    isBlocked: user.isBlocked,
    isProtected: user.isProtected,
    ordersCount: user.ordersCount ?? user._count?.orders ?? 0,
    updatedAt: user.updatedAt.toISOString(),
  };
}
