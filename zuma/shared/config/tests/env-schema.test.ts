import { z } from 'zod';
import { baseEnvSchema, isDocsEnabled, isProduction, loadConfig, refineBaseEnv } from '../src';

const schema = baseEnvSchema.superRefine(refineBaseEnv);

const validEnv = {
  PORT: '3001',
  MONGODB_URI: 'mongodb://localhost:27017/zuma',
  JWT_SECRET: 'user-jwt-secret-0123456789',
  INTERNAL_JWT_SECRET: 'internal-jwt-secret-0123456789abcdef',
};

const load = (overrides: Record<string, string | undefined> = {}) =>
  loadConfig(schema, { ...validEnv, ...overrides } as NodeJS.ProcessEnv);

describe('baseEnvSchema defaults', () => {
  it('applies secure defaults', () => {
    const config = load();
    expect(config).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3001,
      LOG_LEVEL: 'info',
      JWT_ISSUER: 'zuma',
      JWT_ALGORITHMS: ['RS256'],
      INTERNAL_JWT_ISSUER: 'zuma-internal',
      CORS_ALLOWED_ORIGINS: [],
      CORS_ALLOW_CREDENTIALS: false,
      RATE_LIMIT_MAX: 100,
      RATE_LIMIT_WINDOW: '1 minute',
      RATE_LIMIT_SERVICE_MAX: 1000,
      TRUST_PROXY: false,
      HTTP_BODY_LIMIT_BYTES: 65536,
      HTTP_CONNECTION_TIMEOUT_MS: 10000,
      HTTP_REQUEST_TIMEOUT_MS: 30000,
      SHUTDOWN_TIMEOUT_MS: 10000,
      METRICS_ENABLED: true,
    });
    expect(config.DOCS_ENABLED).toBeUndefined();
    expect(config.JWT_JWKS_URI).toBeUndefined();
    expect(config.METRICS_TOKEN).toBeUndefined();
  });

  it('parses comma lists (trimmed, empties dropped) and boolean flags', () => {
    const config = load({
      CORS_ALLOWED_ORIGINS: ' https://a.example.com, ,https://b.example.com ',
      CORS_ALLOW_CREDENTIALS: 'true',
      TRUST_PROXY: 'true',
      METRICS_ENABLED: 'false',
      DOCS_ENABLED: 'false',
      JWT_ALGORITHMS: 'RS256, ES256',
    });
    expect(config.CORS_ALLOWED_ORIGINS).toEqual(['https://a.example.com', 'https://b.example.com']);
    expect(config.CORS_ALLOW_CREDENTIALS).toBe(true);
    expect(config.TRUST_PROXY).toBe(true);
    expect(config.METRICS_ENABLED).toBe(false);
    expect(config.DOCS_ENABLED).toBe(false);
    expect(config.JWT_ALGORITHMS).toEqual(['RS256', 'ES256']);
  });

  it('accepts a JWKS URI when an audience is configured', () => {
    const config = load({ JWT_JWKS_URI: 'https://idp.example.com/.well-known/jwks.json', JWT_AUDIENCE: 'zuma-api' });
    expect(config.JWT_JWKS_URI).toBe('https://idp.example.com/.well-known/jwks.json');
    expect(config.JWT_AUDIENCE).toBe('zuma-api');
  });
});

describe('baseEnvSchema validation', () => {
  it.each<[string, Record<string, string | undefined>, RegExp]>([
    ['missing MONGODB_URI', { MONGODB_URI: undefined }, /MONGODB_URI/],
    ['missing PORT', { PORT: undefined }, /PORT/],
    ['non-numeric PORT', { PORT: 'abc' }, /PORT/],
    ['negative PORT', { PORT: '-1' }, /PORT/],
    ['short JWT_SECRET', { JWT_SECRET: 'short' }, /JWT_SECRET/],
    ['missing INTERNAL_JWT_SECRET', { INTERNAL_JWT_SECRET: undefined }, /INTERNAL_JWT_SECRET/],
    ['INTERNAL_JWT_SECRET shorter than 32', { INTERNAL_JWT_SECRET: 'x'.repeat(31) }, /INTERNAL_JWT_SECRET/],
    [
      'INTERNAL_JWT_SECRET equal to JWT_SECRET',
      { JWT_SECRET: 'same-secret-for-both-0123456789abcdef', INTERNAL_JWT_SECRET: 'same-secret-for-both-0123456789abcdef' },
      /INTERNAL_JWT_SECRET: INTERNAL_JWT_SECRET must differ from JWT_SECRET/,
    ],
    ['JWKS without audience', { JWT_JWKS_URI: 'https://idp.example.com/jwks' }, /JWT_AUDIENCE: JWT_AUDIENCE is required/],
    ['JWKS URI not a URL', { JWT_JWKS_URI: 'not a url', JWT_AUDIENCE: 'a' }, /JWT_JWKS_URI/],
    ['unsupported JWT algorithm', { JWT_ALGORITHMS: 'HS256' }, /JWT_ALGORITHMS/],
    ['empty JWT algorithm list', { JWT_ALGORITHMS: ' , ' }, /JWT_ALGORITHMS/],
    [
      "'*' CORS origin with credentials",
      { CORS_ALLOWED_ORIGINS: '*', CORS_ALLOW_CREDENTIALS: 'true' },
      /CORS_ALLOWED_ORIGINS: '\*' is not allowed/,
    ],
    ['invalid boolean flag', { TRUST_PROXY: 'yes' }, /TRUST_PROXY/],
    ['invalid NODE_ENV', { NODE_ENV: 'staging' }, /NODE_ENV/],
    ['invalid LOG_LEVEL', { LOG_LEVEL: 'verbose' }, /LOG_LEVEL/],
    ['short METRICS_TOKEN', { METRICS_TOKEN: 'short' }, /METRICS_TOKEN/],
    ['zero RATE_LIMIT_MAX', { RATE_LIMIT_MAX: '0' }, /RATE_LIMIT_MAX/],
  ])('rejects %s', (_name, overrides, message) => {
    expect(() => load(overrides)).toThrow(/^Invalid environment configuration: /);
    expect(() => load(overrides)).toThrow(message);
  });

  it('allows a wildcard CORS origin without credentials', () => {
    expect(load({ CORS_ALLOWED_ORIGINS: '*' }).CORS_ALLOWED_ORIGINS).toEqual(['*']);
  });

  it('joins every issue into one readable message', () => {
    expect(() => load({ PORT: undefined, MONGODB_URI: undefined })).toThrow(/PORT: .*; MONGODB_URI: /);
  });
});

describe('loadConfig', () => {
  it('reads process.env by default', () => {
    const original = process.env.ZUMA_TEST_VALUE;
    process.env.ZUMA_TEST_VALUE = 'hello';
    try {
      const value = loadConfig(z.object({ ZUMA_TEST_VALUE: z.string() }));
      expect(value).toEqual({ ZUMA_TEST_VALUE: 'hello' });
    } finally {
      if (original === undefined) delete process.env.ZUMA_TEST_VALUE;
      else process.env.ZUMA_TEST_VALUE = original;
    }
  });
});

describe('isProduction / isDocsEnabled', () => {
  it.each<['development' | 'test' | 'production', boolean | undefined, boolean, boolean]>([
    ['development', undefined, false, true],
    ['test', undefined, false, true],
    ['production', undefined, true, false],
    ['production', true, true, true],
    ['development', false, false, false],
  ])('NODE_ENV=%s DOCS_ENABLED=%p -> production=%p docs=%p', (NODE_ENV, DOCS_ENABLED, production, docs) => {
    expect(isProduction({ NODE_ENV })).toBe(production);
    expect(isDocsEnabled({ NODE_ENV, DOCS_ENABLED })).toBe(docs);
  });
});
