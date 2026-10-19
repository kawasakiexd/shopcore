import { Module } from '@nestjs/common';
import { StorageModule } from '../../infra/storage/storage.module.js';
import { StripeModule } from '../../infra/stripe/stripe.module.js';
import { AdminOrdersController } from './admin-orders.controller.js';
import { InventoryService } from './inventory.service.js';
import { OrderExpiryJob } from './order-expiry.job.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [StripeModule, StorageModule],
  controllers: [OrdersController, AdminOrdersController],
  providers: [OrdersService, InventoryService, OrderExpiryJob],
  exports: [OrdersService, InventoryService],
})
export class OrdersModule {}
