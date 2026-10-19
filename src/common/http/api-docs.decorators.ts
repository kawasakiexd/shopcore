import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import type { z } from 'zod';
import { ERROR_CATALOG, type ErrorCode } from '../errors/error-catalog.js';
import { ProblemDetailsSchema } from '../errors/problem-details.js';
import { PageMetaSchema } from './pagination.js';
import { zodToOpenApi } from './zod-openapi.js';

export function ApiZodResponse(options: {
  status: number;
  schema: z.ZodType;
  description: string;
}): MethodDecorator {
  return ApiResponse({
    status: options.status,
    description: options.description,
    schema: zodToOpenApi(options.schema, 'output'),
  });
}

export function ApiProblems(...codes: ErrorCode[]): MethodDecorator {
  return applyDecorators(
    ...codes.map((code) => {
      const entry = ERROR_CATALOG[code];
      return ApiResponse({
        status: entry.status,
        description: `${code}: ${entry.title}`,
        content: {
          'application/problem+json': {
            schema: zodToOpenApi(ProblemDetailsSchema, 'output'),
          },
        },
      });
    }),
  );
}

export function ApiPaginatedResponse(schema: z.ZodType, description: string): MethodDecorator {
  return ApiResponse({
    status: 200,
    description,
    schema: {
      type: 'object',
      required: ['data', 'meta'],
      properties: {
        data: { type: 'array', items: zodToOpenApi(schema, 'output') },
        meta: zodToOpenApi(PageMetaSchema, 'output'),
      },
    },
  });
}
