import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainException } from '../../common/errors/domain.exception.js';
import type { Env } from '../../config/env.schema.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { isUniqueViolation } from '../../infra/prisma/prisma-errors.js';
import { toUserProfile } from '../users/users.mapper.js';
import type { AuthResponse, LoginInput, RegisterInput, TokenPair } from './auth.schemas.js';
import { PasswordService } from './password.service.js';
import { TokensService } from './tokens.service.js';

const DEMO_USER_CAP = 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokensService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async register(input: RegisterInput, ip?: string, userAgent?: string): Promise<AuthResponse> {
    if (this.config.get('DEMO_MODE', { infer: true })) {
      const count = await this.prisma.user.count();
      if (count >= DEMO_USER_CAP) {
        throw new DomainException('DEMO_LIMIT_REACHED', 'Demo user cap reached.');
      }
    }
    try {
      const user = await this.prisma.user.create({
        data: {
          email: input.email,
          passwordHash: await this.passwords.hash(input.password),
          name: input.name,
          role: 'CUSTOMER',
        },
      });
      const tokens = await this.tokens.issuePair(user, ip, userAgent);
      return { user: toUserProfile(user), tokens };
    } catch (error) {
      if (isUniqueViolation(error, 'email')) {
        throw new DomainException('EMAIL_TAKEN', 'Email is already registered.');
      }
      throw error;
    }
  }

  async login(input: LoginInput, ip?: string, userAgent?: string): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    const matches = user
      ? await this.passwords.verify(user.passwordHash, input.password)
      : await this.passwords.verifyDummy(input.password);
    if (!user || !matches) {
      throw new DomainException('INVALID_CREDENTIALS', 'Invalid email or password.');
    }
    if (user.isBlocked) {
      throw new DomainException('ACCOUNT_BLOCKED', 'Account is blocked.');
    }
    const tokens = await this.tokens.issuePair(user, ip, userAgent);
    return { user: toUserProfile(user), tokens };
  }

  refresh(refreshToken: string, ip?: string, userAgent?: string): Promise<TokenPair> {
    return this.tokens.rotate(refreshToken, ip, userAgent);
  }

  logout(refreshToken: string): Promise<void> {
    return this.tokens.revokeByPresentedToken(refreshToken);
  }

  logoutAll(userId: string): Promise<void> {
    return this.tokens.revokeAllForUser(userId, 'LOGOUT_ALL');
  }
}
