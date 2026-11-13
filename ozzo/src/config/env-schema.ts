import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true');

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3004),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  CACHE_TTL_SECONDS: z.coerce.number().int().min(1).max(86_400).default(300),

  OKTA_ISSUER_BASE_URL: z.string().url(),
  OKTA_AUDIENCE: z.string().min(1),
  /** Defaults to `${OKTA_ISSUER_BASE_URL}/v1/keys`. */
  OKTA_JWKS_URI: z.string().url().optional(),
  ADMIN_GROUP: z.string().min(1).default('ozzo-admin'),

  WALLET_SERVICE_URL: z.string().url().default('http://localhost:3001'),
  WALLET_SERVICE_NAME: z.string().min(1).default('wallet-service'),
  WALLET_SERVICE_TIMEOUT_MS: z.coerce.number().int().min(100).default(5000),
  /** Shared with zuma (INTERNAL_JWT_SECRET); enables x-service-token on outbound calls. */
  INTERNAL_JWT_SECRET: z
    .string()
    .min(32, 'INTERNAL_JWT_SECRET must be at least 32 characters')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  INTERNAL_JWT_ISSUER: z.string().min(1).default('ozzo'),
  USE_MOCK_ZUMA: booleanString.default('false'),

  // New Relic APM
  NEW_RELIC_ENABLED: booleanString.default('false'),
  NEW_RELIC_LICENSE_KEY: z.string().optional(),
  NEW_RELIC_APP_NAME: z.string().min(1).default('ozzo-service'),
  NEW_RELIC_LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Pino logging. LOG_TO_FILE defaults to true in production, false otherwise (resolved in loadConfig).
  LOG_TO_FILE: booleanString.optional(),
  LOG_FILE_PATH: z.string().min(1).default('./logs'),
  LOG_FILE_MAX_SIZE: z.coerce.number().int().min(1024).default(10_485_760),
  LOG_FILE_ROTATE_DAYS: z.coerce.number().int().min(1).max(365).default(7),
  NEWRELIC_LOGS_ENABLED: booleanString.default('false'),
  NEWRELIC_LOGS_ENDPOINT: z.string().url().default('https://log-api.newrelic.com/log/v1'),
}).superRefine((e, ctx) => {
  if ((e.NEW_RELIC_ENABLED || e.NEWRELIC_LOGS_ENABLED) && !e.NEW_RELIC_LICENSE_KEY?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['NEW_RELIC_LICENSE_KEY'],
      message: 'required when NEW_RELIC_ENABLED or NEWRELIC_LOGS_ENABLED is true',
    });
  }
});

export type Env = z.infer<typeof envSchema>;
