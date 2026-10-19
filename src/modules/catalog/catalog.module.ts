import { Module } from '@nestjs/common';
import { StorageModule } from '../../infra/storage/storage.module.js';
import { AdminCategoriesController } from './admin-categories.controller.js';
import { AdminProductImagesController } from './admin-product-images.controller.js';
import { AdminProductsController } from './admin-products.controller.js';
import { CategoriesController } from './categories.controller.js';
import { CategoriesService } from './categories.service.js';
import { ProductImagesService } from './product-images.service.js';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';
import { UploadQuotaService } from './upload-quota.service.js';

@Module({
  imports: [StorageModule],
  controllers: [
    CategoriesController,
    ProductsController,
    AdminCategoriesController,
    AdminProductsController,
    AdminProductImagesController,
  ],
  providers: [CategoriesService, ProductsService, ProductImagesService, UploadQuotaService],
  exports: [ProductsService],
})
export class CatalogModule {}
