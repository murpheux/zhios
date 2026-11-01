import pino from 'pino';
import { buildApp } from '../../src/app';
import { loadTransactionServiceConfig } from '../../src/config/transaction-service-config';
import {
  FakeWalletService,
  InMemoryAuditLogRepository,
  InMemorySystemEventRepository,
  InMemoryTransactionRepository,
} from './in-memory-adapters';

// Test files using buildTestApp must jest.mock the persistence modules and the wallet-service client
// with the in-memory adapters from ./in-memory-adapters (see tests/api/*.test.ts).

export const JWT_SECRET = 'test-user-jwt-secret-0123456789';
export const INTERNAL_JWT_SECRET = 'test-internal-jwt-secret-0123456789abcdef';
export const ALLOWED_ORIGIN = 'https://app.example.com';

export const testEnv = (overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv => ({
  PORT: '3002',
  MONGODB_URI: 'mongodb://unused:27017/zuma',
  JWT_SECRET,
  INTERNAL_JWT_SECRET,
  NODE_ENV: 'test',
  METRICS_ENABLED: 'false',
  DOCS_ENABLED: 'false',
  CORS_ALLOWED_ORIGINS: ALLOWED_ORIGIN,
  ...overrides,
});

export const buildTestApp = async (envOverrides: Record<string, string | undefined> = {}) => {
  const config = loadTransactionServiceConfig(testEnv(envOverrides));
  const app = await buildApp({ config, logger: pino({ level: 'silent' }) });
  await app.ready();

  const bearer = (sub: string, roles: string[] = []) => ({
    authorization: `Bearer ${app.jwt.sign({ sub, roles, exp: Math.floor(Date.now() / 1000) + 300 })}`,
  });

  return {
    app,
    config,
    transactions: InMemoryTransactionRepository.last as InMemoryTransactionRepository,
    audit: InMemoryAuditLogRepository.last as InMemoryAuditLogRepository,
    events: InMemorySystemEventRepository.last as InMemorySystemEventRepository,
    walletService: FakeWalletService.last as FakeWalletService,
    bearer,
  };
};
