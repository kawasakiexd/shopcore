import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Public } from '../../common/auth/public.decorator.js';
import { ApiZodResponse } from '../../common/http/api-docs.decorators.js';
import { DemoService } from './demo.service.js';

const DemoSchema = z.object({
  demoMode: z.boolean(),
  resetSchedule: z.string(),
  nextResetAt: z.string().nullable(),
  accounts: z.array(z.object({ role: z.string(), email: z.string(), password: z.string() })),
  stripeTestCard: z.object({ number: z.string(), expiry: z.string(), cvc: z.string() }),
  limits: z.object({
    maxProducts: z.number(),
    maxCategories: z.number(),
    maxUsers: z.number(),
    uploadDailyQuota: z.number(),
  }),
});

@ApiTags('demo')
@Public()
@Controller('demo')
export class DemoController {
  constructor(private readonly demo: DemoService) {}

  @Get()
  @ApiOperation({ summary: 'Demo mode info and credentials' })
  @ApiZodResponse({ status: 200, schema: DemoSchema, description: 'Demo info' })
  get() {
    return this.demo.describe();
  }
}
