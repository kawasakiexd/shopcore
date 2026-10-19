import { z } from 'zod';

export function zodToOpenApi(schema: z.ZodType, io: 'input' | 'output'): Record<string, unknown> {
  const json = z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    io,
    unrepresentable: 'any',
  }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}
