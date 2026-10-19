import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller.js';
import { HealthIndicators } from './health.indicators.js';
import { ProblemsController } from './problems.controller.js';
import { RootController } from './root.controller.js';

@Module({
  imports: [TerminusModule],
  controllers: [RootController, HealthController, ProblemsController],
  providers: [HealthIndicators],
})
export class SystemModule {}
