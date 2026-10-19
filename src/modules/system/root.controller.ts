import { Controller, Get, Redirect, VERSION_NEUTRAL } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { Public } from '../../common/auth/public.decorator.js';

@Public()
@SkipThrottle({ default: true, strict: true })
@Controller({ path: '/', version: VERSION_NEUTRAL })
export class RootController {
  @Get()
  @Redirect('/docs', 302)
  @ApiExcludeEndpoint()
  root(): void {
    return undefined;
  }
}
