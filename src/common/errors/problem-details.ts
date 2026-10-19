import { z } from 'zod';

export const ProblemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  instance: z.string(),
  code: z.string(),
  requestId: z.string(),
  errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});

export type ProblemDetails = z.infer<typeof ProblemDetailsSchema> & Record<string, unknown>;
