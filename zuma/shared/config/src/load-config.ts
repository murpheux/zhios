import type { ZodType, ZodTypeDef } from 'zod';

// Parses process.env against the given schema, throwing a readable error on failure.
// Input is left unconstrained since zod `.default()`/coercion makes input/output shapes diverge.
export const loadConfig = <T>(
  schema: ZodType<T, ZodTypeDef, unknown>,
  env: NodeJS.ProcessEnv = process.env,
): T => {
  const result = schema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return result.data;
};
