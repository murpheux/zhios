import { z } from 'zod';

// Fields common to every zuma service; each service extends this with its own schema.
export const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  MONGODB_URI: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_ISSUER: z.string().default('zuma'),
  // When set, requireAuth verifies RS256 tokens from this OIDC provider's JWKS endpoint
  // instead of the HS256 shared secret above — see docs/security.md's OIDC migration path.
  JWT_JWKS_URI: z.string().url().optional(),
  JWT_AUDIENCE: z.string().optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
  METRICS_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});

export type BaseEnv = z.infer<typeof baseEnvSchema>;
