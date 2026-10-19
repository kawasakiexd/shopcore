import { Module } from '@nestjs/common';
import { StorageModule } from '../../infra/storage/storage.module.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { CartController } from './cart.controller.js';
import { CartService } from './cart.service.js';

@Module({
  imports: [CatalogModule, StorageModule],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
