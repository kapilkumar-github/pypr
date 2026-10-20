import type { SchemaObject } from '@nestjs/swagger';
import { z } from 'zod';

/**
 * OpenAPI schema from a Zod schema, so docs come from the same schemas that validate requests.
 * Request bodies use the input shape (before transforms), responses the output shape.
 */
export function apiSchema(schema: z.ZodType, io: 'input' | 'output' = 'output'): SchemaObject {
  return z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    io,
    unrepresentable: 'any',
  }) as SchemaObject;
}
