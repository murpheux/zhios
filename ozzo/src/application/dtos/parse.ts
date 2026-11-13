import type { z } from 'zod';
import { ValidationError } from '../../domain';

export function parseDto<S extends z.ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError('Invalid request', result.error.issues);
  }
  return result.data;
}
