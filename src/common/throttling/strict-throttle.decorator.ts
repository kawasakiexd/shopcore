import { applyDecorators, SetMetadata } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

export const STRICT_THROTTLE_KEY = 'strictThrottle';

export function StrictThrottle(options: {
  limit: number;
  ttl: number;
}): MethodDecorator & ClassDecorator {
  return applyDecorators(
    SetMetadata(STRICT_THROTTLE_KEY, true),
    Throttle({ strict: { limit: options.limit, ttl: options.ttl } }),
  );
}
