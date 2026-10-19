import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { DomainException } from '../../common/errors/domain.exception.js';
import { randomToken, sha256Hex } from '../../common/utils/crypto.js';
import type { Env } from '../../config/env.schema.js';
import type { TokenRevokeReason, User } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { TokenPair } from './auth.schemas.js';

const REUSE_GRACE_MS = 10_000;

type TokenUser = Pick<User, 'id' | 'role' | 'isBlocked'>;

@Injectable()
export class TokensService {
  private readonly logger = new Logger(TokensService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async issuePair(user: TokenUser, ip?: string, userAgent?: string): Promise<TokenPair> {
    const familyId = randomUUID();
    return this.createPair(user, familyId, null, ip, userAgent);
  }

  async rotate(refreshToken: string, ip?: string, userAgent?: string): Promise<TokenPair> {
    const tokenHash = sha256Hex(refreshToken);
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.refreshToken.findUnique({
        where: { tokenHash },
        include: { user: true },
      });
      if (!existing)
        throw new DomainException('INVALID_REFRESH_TOKEN', 'Refresh token is invalid.');
      if (existing.user.isBlocked) {
        throw new DomainException('ACCOUNT_BLOCKED', 'Account is blocked.');
      }

      if (existing.revokedAt) {
        if (existing.revokedReason === 'ROTATED') {
          const rotatedAgo = Date.now() - existing.revokedAt.getTime();
          if (rotatedAgo > REUSE_GRACE_MS) {
            await tx.refreshToken.updateMany({
              where: { familyId: existing.familyId, revokedAt: null },
              data: { revokedAt: new Date(), revokedReason: 'REUSE_DETECTED' },
            });
            this.logger.warn(
              { userId: existing.userId, familyId: existing.familyId },
              'auth.refresh_reuse',
            );
            throw new DomainException(
              'REFRESH_TOKEN_REUSED',
              'Refresh token reuse detected; session revoked.',
            );
          }
        }
        throw new DomainException(
          'INVALID_REFRESH_TOKEN',
          'Refresh token is invalid, expired or revoked.',
        );
      }

      if (existing.expiresAt.getTime() <= Date.now()) {
        throw new DomainException(
          'INVALID_REFRESH_TOKEN',
          'Refresh token is invalid, expired or revoked.',
        );
      }

      await tx.refreshToken.update({
        where: { id: existing.id },
        data: { revokedAt: new Date(), revokedReason: 'ROTATED' },
      });

      return this.createPair(existing.user, existing.familyId, existing.id, ip, userAgent, tx);
    });
  }

  async revokeByPresentedToken(refreshToken: string): Promise<void> {
    const tokenHash = sha256Hex(refreshToken);
    const existing = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!existing) return;
    await this.revokeFamily(existing.familyId, 'LOGOUT');
  }

  async revokeFamily(familyId: string, reason: TokenRevokeReason): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  async revokeAllForUser(userId: string, reason: TokenRevokeReason): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  async purgeStale(): Promise<number> {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const result = await this.prisma.refreshToken.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }],
      },
    });
    return result.count;
  }

  private async createPair(
    user: TokenUser,
    familyId: string,
    parentId: string | null,
    ip: string | undefined,
    userAgent: string | undefined,
    client: PrismaService | Parameters<Parameters<PrismaService['$transaction']>[0]>[0] = this
      .prisma,
  ): Promise<TokenPair> {
    const ttlSeconds = this.config.get('JWT_ACCESS_TTL_SECONDS', { infer: true });
    const refreshDays = this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true });
    const accessTokenExpiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const refreshTokenExpiresAt = new Date(Date.now() + refreshDays * 24 * 60 * 60 * 1000);
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, role: user.role, sid: familyId },
      {
        expiresIn: ttlSeconds,
        issuer: 'shopcore-api',
        audience: 'shopcore',
        algorithm: 'HS256',
      },
    );
    const refreshToken = randomToken(32);
    await client.refreshToken.create({
      data: {
        userId: user.id,
        familyId,
        parentId,
        tokenHash: sha256Hex(refreshToken),
        expiresAt: refreshTokenExpiresAt,
        ip: ip?.slice(0, 45),
        userAgent: userAgent?.slice(0, 255),
      },
    });
    return {
      tokenType: 'Bearer',
      accessToken,
      accessTokenExpiresAt: accessTokenExpiresAt.toISOString(),
      refreshToken,
      refreshTokenExpiresAt: refreshTokenExpiresAt.toISOString(),
    };
  }
}
