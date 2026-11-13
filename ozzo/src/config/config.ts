import { envSchema, type Env } from './env-schema';

export interface AppConfig {
  env: Env['NODE_ENV'];
  port: number;
  host: string;
  logLevel: Env['LOG_LEVEL'];
  databaseUrl: string;
  redisUrl: string;
  cacheTtlSeconds: number;
  okta: { issuer: string; audience: string; jwksUri: string; adminGroup: string };
  zuma: {
    baseUrl: string;
    serviceName: string;
    timeoutMs: number;
    internalJwtSecret?: string;
    internalJwtIssuer: string;
    useMock: boolean;
  };
  newRelic: { enabled: boolean; licenseKey?: string; appName: string; logLevel: Env['NEW_RELIC_LOG_LEVEL'] };
  logging: {
    toFile: boolean;
    filePath: string;
    fileMaxSizeBytes: number;
    fileRotateDays: number;
    newRelicLogs: { enabled: boolean; endpoint: string };
  };
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  const e = parsed.data;
  const issuer = e.OKTA_ISSUER_BASE_URL.replace(/\/+$/, '');
  return {
    env: e.NODE_ENV,
    port: e.PORT,
    host: e.HOST,
    logLevel: e.LOG_LEVEL,
    databaseUrl: e.DATABASE_URL,
    redisUrl: e.REDIS_URL,
    cacheTtlSeconds: e.CACHE_TTL_SECONDS,
    okta: {
      issuer,
      audience: e.OKTA_AUDIENCE,
      jwksUri: e.OKTA_JWKS_URI ?? `${issuer}/v1/keys`,
      adminGroup: e.ADMIN_GROUP,
    },
    zuma: {
      baseUrl: e.WALLET_SERVICE_URL.replace(/\/+$/, ''),
      serviceName: e.WALLET_SERVICE_NAME,
      timeoutMs: e.WALLET_SERVICE_TIMEOUT_MS,
      internalJwtSecret: e.INTERNAL_JWT_SECRET,
      internalJwtIssuer: e.INTERNAL_JWT_ISSUER,
      useMock: e.USE_MOCK_ZUMA,
    },
    newRelic: {
      enabled: e.NEW_RELIC_ENABLED,
      licenseKey: e.NEW_RELIC_LICENSE_KEY?.trim() || undefined,
      appName: e.NEW_RELIC_APP_NAME,
      logLevel: e.NEW_RELIC_LOG_LEVEL,
    },
    logging: {
      toFile: e.LOG_TO_FILE ?? e.NODE_ENV === 'production',
      filePath: e.LOG_FILE_PATH,
      fileMaxSizeBytes: e.LOG_FILE_MAX_SIZE,
      fileRotateDays: e.LOG_FILE_ROTATE_DAYS,
      newRelicLogs: { enabled: e.NEWRELIC_LOGS_ENABLED, endpoint: e.NEWRELIC_LOGS_ENDPOINT },
    },
  };
}
