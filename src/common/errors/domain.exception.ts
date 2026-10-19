import type { ErrorCode } from './error-catalog.js';

export class DomainException extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly detail?: string,
    readonly extensions?: Record<string, unknown>,
  ) {
    super(detail ?? code);
    this.name = 'DomainException';
  }
}
