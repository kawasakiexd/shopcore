import { Controller, Get, Header, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/auth/public.decorator.js';
import { ApiProblems, ApiZodResponse } from '../../common/http/api-docs.decorators.js';
import { SlugParamSchema } from '../../common/http/common.schemas.js';
import { CategoriesService } from './categories.service.js';
import { CategorySchema } from './catalog.schemas.js';
import { z } from 'zod';

@ApiTags('catalog')
@Public()
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=30')
  @ApiOperation({ summary: 'List categories' })
  @ApiZodResponse({
    status: 200,
    schema: z.object({ data: z.array(CategorySchema) }),
    description: 'Categories',
  })
  list() {
    return this.categories.list();
  }

  @Get(':slug')
  @Header('Cache-Control', 'public, max-age=30')
  @ApiOperation({ summary: 'Category by slug' })
  @ApiZodResponse({ status: 200, schema: CategorySchema, description: 'Category' })
  @ApiProblems('RESOURCE_NOT_FOUND')
  get(@Param('slug', { schema: SlugParamSchema }) slug: string) {
    return this.categories.getBySlug(slug);
  }
}
