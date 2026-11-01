const mockStartOtelFromEnv = jest.fn();
jest.mock('@zuma/shared-observability', () => ({
  ...jest.requireActual('@zuma/shared-observability'),
  startOtelFromEnv: mockStartOtelFromEnv,
}));

import { authPlugin, healthPlugin, toActor } from '@zuma/shared-http';
import { loadTransactionServiceConfig } from '../src/config/transaction-service-config';
import healthShim from '../src/api/plugins/health';
import authShim, { toActor as toActorShim } from '../src/api/plugins/auth';

const env = (overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv => ({
  PORT: '3002',
  MONGODB_URI: 'mongodb://unused',
  JWT_SECRET: 'test-user-jwt-secret-0123456789',
  INTERNAL_JWT_SECRET: 'test-internal-jwt-secret-0123456789abcdef',
  ...overrides,
});

describe('transaction-service config', () => {
  it('applies service defaults', () => {
    expect(loadTransactionServiceConfig(env())).toMatchObject({
      SERVICE_NAME: 'transaction-service',
      WALLET_SERVICE_URL: 'http://localhost:3001',
      BITCOIN_NETWORK: 'testnet',
      BITCOIN_ADAPTER: 'mock',
    });
  });

  it.each<[string, Record<string, string>, boolean]>([
    ['mock adapter in development', { NODE_ENV: 'development', BITCOIN_ADAPTER: 'mock' }, true],
    ['rpc adapter in production', { NODE_ENV: 'production', BITCOIN_ADAPTER: 'rpc' }, true],
    ['mock adapter (default) in production', { NODE_ENV: 'production' }, false],
  ])('%s -> allowed=%p', (_name, overrides, allowed) => {
    const load = () => loadTransactionServiceConfig(env(overrides));
    if (allowed) expect(load).not.toThrow();
    else expect(load).toThrow('BITCOIN_ADAPTER=mock is not permitted when NODE_ENV=production');
  });

  it.each<[Record<string, string>, RegExp]>([
    [{ BITCOIN_NETWORK: 'signet' }, /BITCOIN_NETWORK/],
    [{ BITCOIN_ADAPTER: 'electrum' }, /BITCOIN_ADAPTER/],
  ])('rejects %j', (overrides, message) => {
    expect(() => loadTransactionServiceConfig(env(overrides))).toThrow(message);
  });

  it('reads process.env by default', () => {
    const original = process.env;
    process.env = env({ SERVICE_NAME: 'from-process-env' });
    try {
      expect(loadTransactionServiceConfig().SERVICE_NAME).toBe('from-process-env');
    } finally {
      process.env = original;
    }
  });
});

describe('plugin re-export shims', () => {
  it('re-export the shared plugins', () => {
    expect(healthShim).toBe(healthPlugin);
    expect(authShim).toBe(authPlugin);
    expect(toActorShim).toBe(toActor);
  });
});

describe('otel entrypoint', () => {
  it('starts OTel from env under the transaction-service name', () => {
    jest.isolateModules(() => {
      require('../src/otel');
    });
    expect(mockStartOtelFromEnv).toHaveBeenCalledWith('transaction-service');
  });
});
