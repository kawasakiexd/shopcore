import { Controller, Get, Param, VERSION_NEUTRAL } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Public } from '../../common/auth/public.decorator.js';
import { DomainException } from '../../common/errors/domain.exception.js';
import { ERROR_CATALOG, slugToErrorCode } from '../../common/errors/error-catalog.js';
import { ApiProblems, ApiZodResponse } from '../../common/http/api-docs.decorators.js';
import type { Env } from '../../config/env.schema.js';

const ProblemDocSchema = z.object({
  type: z.string(),
  code: z.string(),
  title: z.string(),
  status: z.number().int(),
  description: z.string(),
});

@ApiTags('system')
@Public()
@SkipThrottle({ default: true, strict: true })
@Controller({ path: 'problems', version: VERSION_NEUTRAL })
export class ProblemsController {
  constructor(private readonly config: ConfigService<Env, true>) {}

  @Get(':slug')
  @ApiOperation({ summary: 'Problem type documentation' })
  @ApiZodResponse({ status: 200, schema: ProblemDocSchema, description: 'Problem type' })
  @ApiProblems('NOT_FOUND')
  get(@Param('slug', { schema: z.string().min(1).max(80) }) slug: string) {
    const code = slugToErrorCode(slug);
    if (!code) throw new DomainException('NOT_FOUND', 'Unknown problem type.');
    const entry = ERROR_CATALOG[code];
    const publicUrl = this.config.get('PUBLIC_API_URL', { infer: true });
    return {
      type: `${publicUrl}/problems/${slug}`,
      code,
      title: entry.title,
      status: entry.status,
      description: entry.description,
    };
  }
}
