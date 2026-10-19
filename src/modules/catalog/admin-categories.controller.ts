import { Body, Controller, Delete, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/auth/roles.decorator.js';
import { ApiProblems, ApiZodResponse } from '../../common/http/api-docs.decorators.js';
import { UuidParamSchema } from '../../common/http/common.schemas.js';
import {
  CategorySchema,
  CreateCategorySchema,
  PatchCategorySchema,
  type CreateCategoryInput,
  type PatchCategoryInput,
} from './catalog.schemas.js';
import { CategoriesService } from './categories.service.js';

@ApiTags('admin-catalog')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/categories')
export class AdminCategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Post()
  @ApiOperation({ summary: 'Create category' })
  @ApiZodResponse({ status: 201, schema: CategorySchema, description: 'Created' })
  @ApiProblems('SLUG_TAKEN', 'DEMO_LIMIT_REACHED')
  create(@Body({ schema: CreateCategorySchema }) body: CreateCategoryInput) {
    return this.categories.create(body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update category' })
  @ApiZodResponse({ status: 200, schema: CategorySchema, description: 'Updated' })
  @ApiProblems('RESOURCE_NOT_FOUND', 'SLUG_TAKEN')
  patch(
    @Param('id', { schema: UuidParamSchema }) id: string,
    @Body({ schema: PatchCategorySchema }) body: PatchCategoryInput,
  ) {
    return this.categories.patch(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete empty category' })
  @ApiProblems('RESOURCE_NOT_FOUND', 'CATEGORY_NOT_EMPTY')
  remove(@Param('id', { schema: UuidParamSchema }) id: string) {
    return this.categories.remove(id);
  }
}
