import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/auth/roles.decorator.js';
import { ApiZodResponse } from '../../common/http/api-docs.decorators.js';
import {
  RevenueSeriesSchema,
  StatsRangeQuerySchema,
  StatsSummarySchema,
  TopProductsQuerySchema,
  TopProductsSchema,
  type StatsRangeQuery,
  type TopProductsQuery,
} from './stats.schemas.js';
import { StatsService } from './stats.service.js';

@ApiTags('admin-stats')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/stats')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Admin stats summary' })
  @ApiZodResponse({ status: 200, schema: StatsSummarySchema, description: 'Summary' })
  summary(@Query({ schema: StatsRangeQuerySchema }) query: StatsRangeQuery) {
    return this.stats.summary(query);
  }

  @Get('revenue')
  @ApiOperation({ summary: 'Revenue by day' })
  @ApiZodResponse({ status: 200, schema: RevenueSeriesSchema, description: 'Revenue series' })
  revenue(@Query({ schema: StatsRangeQuerySchema }) query: StatsRangeQuery) {
    return this.stats.revenue(query);
  }

  @Get('top-products')
  @ApiOperation({ summary: 'Top products' })
  @ApiZodResponse({ status: 200, schema: TopProductsSchema, description: 'Top products' })
  topProducts(@Query({ schema: TopProductsQuerySchema }) query: TopProductsQuery) {
    return this.stats.topProducts(query);
  }
}
