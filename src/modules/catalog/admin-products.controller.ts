import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/auth/roles.decorator.js';
import {
  ApiPaginatedResponse,
  ApiProblems,
  ApiZodResponse,
} from '../../common/http/api-docs.decorators.js';
import { UuidParamSchema } from '../../common/http/common.schemas.js';
import {
  AdminListProductsQuerySchema,
  AdminProductSchema,
  CreateProductSchema,
  PatchProductSchema,
  type AdminListProductsQuery,
  type CreateProductInput,
  type PatchProductInput,
} from './catalog.schemas.js';
import { ProductsService } from './products.service.js';

@ApiTags('admin-catalog')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/products')
export class AdminProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'Admin product list' })
  @ApiPaginatedResponse(AdminProductSchema, 'Products')
  list(@Query({ schema: AdminListProductsQuerySchema }) query: AdminListProductsQuery) {
    return this.products.listAdmin(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Admin product detail' })
  @ApiZodResponse({ status: 200, schema: AdminProductSchema, description: 'Product' })
  @ApiProblems('RESOURCE_NOT_FOUND')
  get(@Param('id', { schema: UuidParamSchema }) id: string) {
    return this.products.getAdmin(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create product' })
  @ApiZodResponse({ status: 201, schema: AdminProductSchema, description: 'Created' })
  @ApiProblems('SLUG_TAKEN', 'SKU_TAKEN', 'CATEGORY_NOT_FOUND', 'DEMO_LIMIT_REACHED')
  create(@Body({ schema: CreateProductSchema }) body: CreateProductInput) {
    return this.products.create(body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update product' })
  @ApiZodResponse({ status: 200, schema: AdminProductSchema, description: 'Updated' })
  @ApiProblems('RESOURCE_NOT_FOUND', 'SLUG_TAKEN', 'SKU_TAKEN', 'CATEGORY_NOT_FOUND')
  patch(
    @Param('id', { schema: UuidParamSchema }) id: string,
    @Body({ schema: PatchProductSchema }) body: PatchProductInput,
  ) {
    return this.products.patch(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Archive product' })
  @ApiProblems('RESOURCE_NOT_FOUND')
  remove(@Param('id', { schema: UuidParamSchema }) id: string) {
    return this.products.archive(id);
  }
}
