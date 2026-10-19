import { Body, Controller, Delete, HttpCode, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { hours } from '@nestjs/throttler';
import type { Request } from 'express';
import { Roles } from '../../common/auth/roles.decorator.js';
import { ApiProblems, ApiZodResponse } from '../../common/http/api-docs.decorators.js';
import { UuidParamSchema } from '../../common/http/common.schemas.js';
import { StrictThrottle } from '../../common/throttling/strict-throttle.decorator.js';
import {
  AttachImageSchema,
  PatchImageSchema,
  ProductImageSchema,
  UploadUrlResponseSchema,
  UploadUrlSchema,
  type AttachImageInput,
  type PatchImageInput,
  type UploadUrlInput,
} from './catalog.schemas.js';
import { ProductImagesService } from './product-images.service.js';

@ApiTags('admin-catalog')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/products/:id/images')
export class AdminProductImagesController {
  constructor(private readonly images: ProductImagesService) {}

  @Post('upload-url')
  @StrictThrottle({ limit: 20, ttl: hours(1) })
  @ApiOperation({ summary: 'Presign an R2 upload URL' })
  @ApiZodResponse({ status: 201, schema: UploadUrlResponseSchema, description: 'Upload URL' })
  @ApiProblems(
    'RESOURCE_NOT_FOUND',
    'IMAGE_LIMIT_REACHED',
    'UPLOAD_QUOTA_EXCEEDED',
    'STORAGE_ERROR',
  )
  uploadUrl(
    @Param('id', { schema: UuidParamSchema }) id: string,
    @Body({ schema: UploadUrlSchema }) body: UploadUrlInput,
    @Req() req: Request,
  ) {
    return this.images.createUploadUrl(id, body, req.ip ?? 'unknown');
  }

  @Post()
  @ApiOperation({ summary: 'Attach an uploaded image' })
  @ApiZodResponse({ status: 201, schema: ProductImageSchema, description: 'Image' })
  @ApiProblems('RESOURCE_NOT_FOUND', 'UPLOAD_NOT_FOUND', 'UPLOAD_INVALID', 'IMAGE_LIMIT_REACHED')
  attach(
    @Param('id', { schema: UuidParamSchema }) id: string,
    @Body({ schema: AttachImageSchema }) body: AttachImageInput,
  ) {
    return this.images.attach(id, body);
  }

  @Patch(':imageId')
  @ApiOperation({ summary: 'Edit image alt or position' })
  @ApiZodResponse({ status: 200, schema: ProductImageSchema, description: 'Image' })
  @ApiProblems('RESOURCE_NOT_FOUND')
  patch(
    @Param('id', { schema: UuidParamSchema }) id: string,
    @Param('imageId', { schema: UuidParamSchema }) imageId: string,
    @Body({ schema: PatchImageSchema }) body: PatchImageInput,
  ) {
    return this.images.patch(id, imageId, body);
  }

  @Delete(':imageId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete image' })
  @ApiProblems('RESOURCE_NOT_FOUND')
  remove(
    @Param('id', { schema: UuidParamSchema }) id: string,
    @Param('imageId', { schema: UuidParamSchema }) imageId: string,
  ) {
    return this.images.remove(id, imageId);
  }
}
