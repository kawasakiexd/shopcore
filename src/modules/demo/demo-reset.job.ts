import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import type { Env } from '../../config/env.schema.js';
import { DemoService } from './demo.service.js';

@Injectable()
export class DemoResetJob {
  constructor(
    private readonly demo: DemoService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Cron('0 3 * * *', { timeZone: 'UTC' })
  async handle(): Promise<void> {
    if (!this.config.get('DEMO_MODE', { infer: true })) return;
    await this.demo.reset();
  }
}
