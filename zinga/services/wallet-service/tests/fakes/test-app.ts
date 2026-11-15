import pino from 'pino';
import type { Pool } from 'pg';
import { createServiceTokenSigner } from '@zinga/shared-http';
import { buildApp } from '../../src/app';
import { loadWalletServiceConfig } from '../../src/config/wallet-service-config';
import { FakeTransactionHistoryClient, InMemoryLedgerRepository, InMemoryWalletRepository } from './in-memory-repositories';

// Test files that use buildTestApp must replace the PostgreSQL adapters with the in-memory fakes:
//
//   jest.mock('../../src/infrastructure/persistence/wallet.repository', () => ({
//     PostgresWalletRepository: jest.requireActual('../fakes/in-memory-repositories').InMemoryWalletRepository,
//   }));
//   (same for ledger.repository / transaction-history.client)

export const JWT_SECRET = 'test-user-jwt-secret-0123456789';
export const INTERNAL_JWT_SECRET = 'test-internal-jwt-secret-0123456789abcdef';
export const ALLOWED_ORIGIN = 'https://app.example.com';

export const testEnv = (overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv => ({
  PORT: '3001',
  DATABASE_URL: 'postgresql://unused:unused@localhost:5432/zinga-test',
  JWT_SECRET,
  INTERNAL_JWT_SECRET,
  NODE_ENV: 'test',
  METRICS_ENABLED: 'false',
  DOCS_ENABLED: 'false',
  CORS_ALLOWED_ORIGINS: ALLOWED_ORIGIN,
  LEDGER_VERIFICATION_ENABLED: 'true',
  LEDGER_VERIFICATION_INTERVAL_MS: '3600000',
  TAMPER_DETECTION_ENABLED: 'true',
  TAMPER_DETECTION_LOG_ERRORS: 'true',
  ...overrides,
});

// Mock pgPool for testing (repositories are mocked, so this pool is never actually used)
const mockPgPool = {
  query: jest.fn(),
  connect: jest.fn(),
  end: jest.fn(),
} as unknown as Pool;

export const buildTestApp = async (envOverrides: Record<string, string | undefined> = {}) => {
  const config = loadWalletServiceConfig(testEnv(envOverrides));
  const app = await buildApp({ config, logger: pino({ level: 'silent' }), pgPool: mockPgPool });
  await app.ready();
  const wallets = InMemoryWalletRepository.last as InMemoryWalletRepository;
  const ledger = InMemoryLedgerRepository.last as InMemoryLedgerRepository;
  const history = FakeTransactionHistoryClient.last as FakeTransactionHistoryClient;

  const bearer = (sub: string, roles: string[] = []) => ({
    authorization: `Bearer ${app.jwt.sign({ sub, roles, exp: Math.floor(Date.now() / 1000) + 300 })}`,
  });
  const serviceHeaders = (caller: string, audience = 'wallet-service') => ({
    'x-service-token': createServiceTokenSigner({
      secret: INTERNAL_JWT_SECRET,
      issuer: 'zuma-internal',
      serviceName: caller,
    }).sign(audience),
  });

  return { app, config, wallets, ledger, history, bearer, serviceHeaders };
};
