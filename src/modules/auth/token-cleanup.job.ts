import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TokensService } from './tokens.service.js';

@Injectable()
export class TokenCleanupJob {
  private readonly logger = new Logger(TokenCleanupJob.name);

  constructor(private readonly tokens: TokensService) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, { timeZone: 'UTC' })
  async handle(): Promise<void> {
    const removed = await this.tokens.purgeStale();
    this.logger.log({ removed }, 'Purged stale refresh tokens');
  }
}
