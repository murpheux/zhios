import { z } from 'zod';
import type { ZodType, ZodTypeDef } from 'zod';

// "true"/"false" env flag with a default.
const boolFlag = (defaultValue: boolean) =>
  z
    .enum(['true', 'false'])
    .default(defaultValue ? 'true' : 'false')
    .transform((v) => v === 'true');

// Optional "true"/"false" env flag; `undefined` means "use the NODE_ENV-dependent default".
const optionalBoolFlag = () =>
  z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true'));

// Comma-separated list → trimmed, non-empty entries.
const commaList = (defaultValue = '') =>
  z
    .string()
    .default(defaultValue)
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    );

export const ASYMMETRIC_JWT_ALGORITHMS = [
  'RS256',
  'RS384',
  'RS512',
  'PS256',
  'PS384',
  'PS512',
  'ES256',
  'ES384',
  'ES512',
] as const;
export type AsymmetricJwtAlgorithm = (typeof ASYMMETRIC_JWT_ALGORITHMS)[number];

/**
 * PostgreSQL-specific base environment schema for Zinga.
 * Extends the zuma patterns with PostgreSQL connection instead of MongoDB.
 * Includes ledger verification and tamper detection feature flags.
 */
export const zingaBaseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Rotating file output (pino-roll): daily, and when a file reaches LOG_FILE_MAX_SIZE bytes.
  LOG_TO_FILE: boolFlag(false),
  LOG_FILE_PATH: z.string().min(1).default('./logs'),
  LOG_FILE_MAX_SIZE: z.coerce.number().int().positive().default(10_485_760),
  LOG_FILE_ROTATE_DAYS: z.coerce.number().int().positive().default(7),

  // New Relic APM. The agent itself reads NEW_RELIC_* from process.env (see initNewRelic); these
  // entries validate them. NEW_RELIC_APP_NAME defaults to the service name.
  NEW_RELIC_ENABLED: boolFlag(false),
  NEW_RELIC_LICENSE_KEY: z.string().min(1).optional(),
  NEW_RELIC_APP_NAME: z.string().min(1).optional(),
  NEW_RELIC_LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Forward application logs to New Relic (agent log forwarding + trace decorating).
  NEWRELIC_LOGS_ENABLED: boolFlag(false),

  // PostgreSQL connection (replaces MONGODB_URI from zuma)
  DATABASE_URL: z.string().url().describe('PostgreSQL connection URL (postgresql://...)'),

  // Authentication
  JWT_SECRET: z.string().min(16),
  JWT_ISSUER: z.string().default('zinga'),

  // When set, requireAuth verifies tokens from this OIDC provider's JWKS endpoint instead of the
  // HS256 shared secret above — JWT_AUDIENCE then becomes mandatory (see refineZingaEnv).
  JWT_JWKS_URI: z.string().url().optional(),
  JWT_AUDIENCE: z.string().min(1).optional(),

  // Algorithms accepted on the JWKS path; the HS256 path is always pinned to HS256.
  JWT_ALGORITHMS: commaList('RS256').pipe(
    z.array(z.enum(ASYMMETRIC_JWT_ALGORITHMS)).min(1),
  ),

  // Service-to-service tokens (x-service-token header); deliberately separate from JWT_SECRET.
  INTERNAL_JWT_SECRET: z.string().min(32),
  INTERNAL_JWT_ISSUER: z.string().min(1).default('zinga-internal'),

  // HTTP hardening
  CORS_ALLOWED_ORIGINS: commaList(),
  CORS_ALLOW_CREDENTIALS: boolFlag(false),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW: z.string().min(1).default('1 minute'),

  // Budget for authenticated service callers (they fan out on behalf of many users).
  RATE_LIMIT_SERVICE_MAX: z.coerce.number().int().positive().default(1000),
  TRUST_PROXY: boolFlag(false),
  HTTP_BODY_LIMIT_BYTES: z.coerce.number().int().positive().default(64 * 1024),
  HTTP_CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  HTTP_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),

  // /docs: defaults to on outside production, off in production (see isDocsEnabled).
  DOCS_ENABLED: optionalBoolFlag(),

  // Observability
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  METRICS_ENABLED: boolFlag(true),

  // Bearer token for /metrics; required for /metrics to be exposed when NODE_ENV=production.
  METRICS_TOKEN: z.string().min(16).optional(),

  // Cross-service calls
  TRANSACTION_SERVICE_URL: z.string().url().default('http://localhost:3002'),
  TRANSACTION_SERVICE_TIMEOUT_MS: z.coerce.number().int().min(100).max(60000).default(5000),

  // Ledger verification and tamper detection (Enhancement 2 & 4: Transaction Immutability Review)
  LEDGER_VERIFICATION_ENABLED: boolFlag(true).describe(
    'Enable periodic verification of ledger entry hashes to detect unauthorized modifications',
  ),
  LEDGER_VERIFICATION_INTERVAL_MS: z.coerce.number().int().min(1000).default(3600000).describe(
    'Interval (ms) between ledger verification runs; default 1 hour',
  ),

  TAMPER_DETECTION_ENABLED: boolFlag(true).describe(
    'Enable hash verification on read to detect database-level modifications',
  ),
  TAMPER_DETECTION_LOG_ERRORS: boolFlag(true).describe(
    'Log detected tamper attempts; disable to fail silently in audit-only mode',
  ),
});

export type ZingaBaseEnv = z.infer<typeof zingaBaseEnvSchema>;

export type ZingaConfig = ZingaBaseEnv & {
  SERVICE_NAME: string;
};

/**
 * Cross-field rules for Zinga environment.
 * Apply with `.superRefine(refineZingaEnv)` on extended schemas.
 */
export const refineZingaEnv = (env: ZingaBaseEnv, ctx: z.RefinementCtx): void => {
  if (env.JWT_JWKS_URI && !env.JWT_AUDIENCE) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['JWT_AUDIENCE'],
      message: 'JWT_AUDIENCE is required when JWT_JWKS_URI is set',
    });
  }
  if (env.CORS_ALLOW_CREDENTIALS && env.CORS_ALLOWED_ORIGINS.includes('*')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['CORS_ALLOWED_ORIGINS'],
      message: "'*' is not allowed when CORS_ALLOW_CREDENTIALS=true; list explicit origins",
    });
  }
  if (env.INTERNAL_JWT_SECRET === env.JWT_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['INTERNAL_JWT_SECRET'],
      message: 'INTERNAL_JWT_SECRET must differ from JWT_SECRET',
    });
  }
  // DATABASE_URL must be a valid PostgreSQL connection string
  if (!env.DATABASE_URL.startsWith('postgresql://') && !env.DATABASE_URL.startsWith('postgres://')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['DATABASE_URL'],
      message: 'DATABASE_URL must be a PostgreSQL connection string (postgresql://... or postgres://...)',
    });
  }
};

export const isProduction = (env: Pick<ZingaBaseEnv, 'NODE_ENV'>): boolean =>
  env.NODE_ENV === 'production';

// /docs is opt-in in production, opt-out elsewhere.
export const isDocsEnabled = (env: Pick<ZingaBaseEnv, 'NODE_ENV' | 'DOCS_ENABLED'>): boolean =>
  env.DOCS_ENABLED ?? !isProduction(env);

/**
 * Parses process.env against the given schema, throwing a readable error on failure.
 * Input is left unconstrained since zod `.default()`/coercion makes input/output shapes diverge.
 */
export const loadConfig = <T>(
  schema: ZodType<T, ZodTypeDef, unknown>,
  env: NodeJS.ProcessEnv = process.env,
): T => {
  const result = schema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid Zinga environment configuration: ${issues}`);
  }
  return result.data;
};

// Extended schema for wallet service + PostgreSQL
const zingaWalletServiceEnvSchema = zingaBaseEnvSchema
  .extend({
    SERVICE_NAME: z.string().min(1).default('wallet-service'),
  })
  .superRefine(refineZingaEnv);

/**
 * Load and validate Zinga wallet service configuration from environment.
 * Throws on validation failure.
 */
export const loadZingaConfig = (env: NodeJS.ProcessEnv = process.env): ZingaConfig =>
  loadConfig(zingaWalletServiceEnvSchema, env);
