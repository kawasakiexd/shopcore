import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { DomainException } from '../../common/errors/domain.exception.js';
import { DemoService } from './demo.service.js';

@Injectable()
export class DemoMaintenanceGuard implements CanActivate {
  constructor(private readonly demo: DemoService) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.demo.isResetting()) return true;
    const req = context.switchToHttp().getRequest<Request>();
    if (req.originalUrl.startsWith('/health')) return true;
    const res = context.switchToHttp().getResponse<Response>();
    res.setHeader('Retry-After', '30');
    throw new DomainException('DEMO_RESET_IN_PROGRESS', 'Demo data is being reset.');
  }
}
