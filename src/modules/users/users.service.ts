import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { DomainException } from '../../common/errors/domain.exception.js';
import { paginate, skipTake } from '../../common/http/pagination.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { PasswordService } from '../auth/password.service.js';
import { TokensService } from '../auth/tokens.service.js';
import { toAdminUser, toUserProfile } from './users.mapper.js';
import type {
  AdminUser,
  AdminUserListQuery,
  ChangePasswordInput,
  PatchAdminUserInput,
  UpdateMeInput,
  UserProfile,
} from './users.schemas.js';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokensService,
  ) {}

  async getProfile(userId: string): Promise<UserProfile> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user)
      throw new DomainException('RESOURCE_NOT_FOUND', 'User not found.', { resource: 'User' });
    return toUserProfile(user);
  }

  async updateProfile(userId: string, input: UpdateMeInput): Promise<UserProfile> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { name: input.name },
    });
    return toUserProfile(user);
  }

  async changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user)
      throw new DomainException('RESOURCE_NOT_FOUND', 'User not found.', { resource: 'User' });
    if (user.isProtected) {
      throw new DomainException('DEMO_PROTECTED_RESOURCE', 'This demo resource is read-only.');
    }
    const matches = await this.passwords.verify(user.passwordHash, input.currentPassword);
    if (!matches) {
      throw new DomainException('INVALID_CURRENT_PASSWORD', 'Current password is incorrect.');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await this.passwords.hash(input.newPassword) },
    });
    await this.tokens.revokeAllForUser(userId, 'PASSWORD_CHANGED');
  }

  async adminList(query: AdminUserListQuery) {
    const where: Prisma.UserWhereInput = {};
    if (query.role) where.role = query.role;
    if (query.isBlocked !== undefined) where.isBlocked = query.isBlocked;
    if (query.q) {
      where.OR = [
        { email: { contains: query.q, mode: 'insensitive' } },
        { name: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    const { skip, take } = skipTake(query.page, query.limit);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { _count: { select: { orders: true } } },
      }),
    ]);
    return paginate(rows.map(toAdminUser), query.page, query.limit, total);
  }

  async adminGet(id: string): Promise<AdminUser> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { _count: { select: { orders: true } } },
    });
    if (!user)
      throw new DomainException('RESOURCE_NOT_FOUND', 'User not found.', { resource: 'User' });
    return toAdminUser(user);
  }

  async adminPatch(actorId: string, id: string, input: PatchAdminUserInput): Promise<AdminUser> {
    if (actorId === id) {
      throw new DomainException(
        'CANNOT_MODIFY_SELF',
        'Admins cannot change their own role or block themselves.',
      );
    }
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user)
      throw new DomainException('RESOURCE_NOT_FOUND', 'User not found.', { resource: 'User' });
    if (user.isProtected) {
      throw new DomainException('DEMO_PROTECTED_RESOURCE', 'This demo resource is read-only.');
    }
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(input.role ? { role: input.role } : {}),
        ...(input.isBlocked !== undefined ? { isBlocked: input.isBlocked } : {}),
      },
      include: { _count: { select: { orders: true } } },
    });
    if (input.isBlocked === true) {
      await this.tokens.revokeAllForUser(id, 'USER_BLOCKED');
    }
    return toAdminUser(updated);
  }
}
