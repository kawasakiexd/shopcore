import { Module } from '@nestjs/common';
import { StorageModule } from '../../infra/storage/storage.module.js';
import { DemoController } from './demo.controller.js';
import { DemoMaintenanceGuard } from './demo-maintenance.guard.js';
import { DemoResetJob } from './demo-reset.job.js';
import { DemoService } from './demo.service.js';

@Module({
  imports: [StorageModule],
  controllers: [DemoController],
  providers: [DemoService, DemoMaintenanceGuard, DemoResetJob],
  exports: [DemoService, DemoMaintenanceGuard],
})
export class DemoModule {}
