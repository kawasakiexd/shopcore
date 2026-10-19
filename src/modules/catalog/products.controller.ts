import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/auth/public.decorator.js';
import {
  ApiPaginatedResponse,
  ApiProblems,
  ApiZodResponse,
} from '../../common/http/api-docs.decorators.js';
import { SlugParamSchema } from '../../common/http/common.schemas.js';
import {
  ListProductsQuerySchema,
  ProductDetailSchema,
  ProductListItemSchema,
  type ListProductsQuery,
} from './catalog.schemas.js';
import { ProductsService } from './products.service.js';

@ApiTags('catalog')
@Public()
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=30')
  @ApiOperation({ summary: 'List active products' })
  @ApiPaginatedResponse(ProductListItemSchema, 'Products')
  list(@Query({ schema: ListProductsQuerySchema }) query: ListProductsQuery) {
    return this.products.listPublic(query);
  }

  @Get(':slug')
  @Header('Cache-Control', 'public, max-age=30')
  @ApiOperation({ summary: 'Product detail' })
  @ApiZodResponse({ status: 200, schema: ProductDetailSchema, description: 'Product' })
  @ApiProblems('RESOURCE_NOT_FOUND')
  get(@Param('slug', { schema: SlugParamSchema }) slug: string) {
    return this.products.getPublicBySlug(slug);
  }
}
