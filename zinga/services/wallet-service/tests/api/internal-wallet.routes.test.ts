jest.mock('../../src/infrastructure/persistence/postgres-wallet.repository', () => ({
  PostgresWalletRepository: jest.requireActual('../fakes/in-memory-repositories').InMemoryWalletRepository,
}));
jest.mock('../../src/infrastructure/persistence/postgres-ledger.repository', () => ({
  PostgresLedgerRepository: jest.requireActual('../fakes/in-memory-repositories').InMemoryLedgerRepository,
}));
jest.mock('../../src/infrastructure/clients/transaction-history.client', () => ({
  TransactionHistoryHttpClient: jest.requireActual('../fakes/in-memory-repositories').FakeTransactionHistoryClient,
}));

import type { LightMyRequestResponse } from 'fastify';
import { createServiceTokenSigner } from '@zinga/shared-http';
import { buildTestApp } from '../fakes/test-app';

type Harness = Awaited<ReturnType<typeof buildTestApp>>;
type Headers = Record<string, string | string[]>;

const TX_ID = '6710f1f1c2a1b2c3d4e5f6a8';
const OTHER_TX = '6710f1f1c2a1b2c3d4e5f6a9';
const MISSING_ID = 'ffffffffffffffffffffffff';

describe('internal wallet routes (/internal, x-service-token)', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await buildTestApp();
  });
  afterEach(async () => {
    await h.app.close();
  });

  const debit = (id: string, payload: Record<string, unknown>, headers = h.serviceHeaders('transaction-service')) =>
    h.app.inject({ method: 'POST', url: `/internal/wallets/${id}/debits`, headers: headers as Headers, payload });
  const credit = (id: string, payload: Record<string, unknown>, headers = h.serviceHeaders('transaction-service')) =>
    h.app.inject({ method: 'POST', url: `/internal/wallets/${id}/credits`, headers: headers as Headers, payload });

  describe('service authentication', () => {
    const foreignSigner = createServiceTokenSigner({
      secret: 'another-internal-secret-0123456789abcdef',
      issuer: 'zuma-internal',
      serviceName: 'transaction-service',
    });

    it.each<[string, () => Record<string, string>, number, string]>([
      ['no token', () => ({}), 401, 'UNAUTHORIZED'],
      ['a user bearer token only', () => h.bearer('alice', ['admin']), 401, 'UNAUTHORIZED'],
      ['wrong audience', () => h.serviceHeaders('transaction-service', 'transaction-service'), 401, 'UNAUTHORIZED'],
      ['wrong secret', () => ({ 'x-service-token': foreignSigner.sign('wallet-service') }), 401, 'UNAUTHORIZED'],
      ['garbage token', () => ({ 'x-service-token': 'a.b.c' }), 401, 'UNAUTHORIZED'],
      ['a caller that is not allow-listed', () => h.serviceHeaders('graphql-gateway'), 403, 'FORBIDDEN'],
    ])('rejects %s', async (_name, headers, status, code) => {
      const wallet = h.wallets.seed({ balanceSats: 5000 });
      const hdrs = headers() as Headers;
      for (const res of [
        await h.app.inject({ method: 'GET', url: `/internal/wallets/${wallet.id}`, headers: hdrs }),
        await debit(wallet.id, { transactionId: TX_ID, amountSats: '100' }, hdrs),
        await credit(wallet.id, { transactionId: TX_ID, amountSats: '100', reason: 'refund' }, hdrs),
      ] as const) {
        expect((res as LightMyRequestResponse).statusCode).toBe(status);
        expect((res as LightMyRequestResponse).json()).toMatchObject({ code });
      }
      expect(h.wallets.wallets.get(wallet.id)?.balanceSats).toBe(5000);
    });
  });

  describe('GET /internal/wallets/:id', () => {
    it('returns only the ownership/status summary', async () => {
      const wallet = h.wallets.seed({ ownerUserId: 'alice', status: 'suspended', balanceSats: 99 });
      const res = (await h.app.inject({
        method: 'GET',
        url: `/internal/wallets/${wallet.id}`,
        headers: h.serviceHeaders('transaction-service') as Headers,
      })) as LightMyRequestResponse;
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        id: wallet.id,
        ownerUserId: 'alice',
        status: 'suspended',
        network: 'testnet',
        address: wallet.address,
      });
    });

    it('404s for a missing wallet and 400s for a malformed id', async () => {
      const headers = h.serviceHeaders('transaction-service') as Headers;
      expect(((await h.app.inject({ method: 'GET', url: `/internal/wallets/${MISSING_ID}`, headers })) as LightMyRequestResponse).statusCode).toBe(404);
      expect(((await h.app.inject({ method: 'GET', url: '/internal/wallets/xyz', headers })) as LightMyRequestResponse).statusCode).toBe(400);
    });
  });

  describe('POST /internal/wallets/:id/debits', () => {
    it('debits once per transactionId', async () => {
      const wallet = h.wallets.seed({ balanceSats: 5000 });
      const first = (await debit(wallet.id, { transactionId: TX_ID, amountSats: '1200' })) as LightMyRequestResponse;
      const replay = (await debit(wallet.id, { transactionId: TX_ID, amountSats: '1200' })) as LightMyRequestResponse;
      expect(first.statusCode).toBe(200);
      expect(first.json()).toEqual({ walletId: wallet.id, balanceCache: '3800' });
      expect(replay.json()).toEqual({ walletId: wallet.id, balanceCache: '3800' });
      expect(h.wallets.wallets.get(wallet.id)?.balanceSats).toBe(3800);
    });

    it.each<[string, { balanceSats?: number; status?: 'active' | 'suspended' | 'archived' }, string, number, string]>([
      ['insufficient funds', { balanceSats: 100 }, '101', 409, 'INSUFFICIENT_FUNDS'],
      ['suspended wallet', { balanceSats: 1000, status: 'suspended' }, '1', 409, 'WALLET_NOT_ACTIVE'],
      ['archived wallet', { balanceSats: 1000, status: 'archived' }, '1', 409, 'WALLET_NOT_ACTIVE'],
    ])('rejects %s and leaves no ledger entry', async (_name, seed, amountSats, status, code) => {
      const wallet = h.wallets.seed(seed);
      const res = (await debit(wallet.id, { transactionId: TX_ID, amountSats })) as LightMyRequestResponse;
      expect(res.statusCode).toBe(status);
      expect(res.json()).toMatchObject({ code });
      expect(h.wallets.wallets.get(wallet.id)?.balanceSats).toBe(seed.balanceSats);
      expect(h.ledger.entries.size).toBe(0);
    });

    it('allows debiting the exact balance to zero', async () => {
      const wallet = h.wallets.seed({ balanceSats: 100 });
      expect(((await debit(wallet.id, { transactionId: TX_ID, amountSats: '100' })) as LightMyRequestResponse).json().balanceCache).toBe('0');
    });

    it('404s for a missing wallet', async () => {
      expect(((await debit(MISSING_ID, { transactionId: TX_ID, amountSats: '1' })) as LightMyRequestResponse).statusCode).toBe(404);
    });

    it('409s IDEMPOTENCY_CONFLICT when the transactionId is replayed with another amount', async () => {
      const wallet = h.wallets.seed({ balanceSats: 5000 });
      await debit(wallet.id, { transactionId: TX_ID, amountSats: '100' });
      const res = (await debit(wallet.id, { transactionId: TX_ID, amountSats: '200' })) as LightMyRequestResponse;
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    });

    it.each<[string, Record<string, unknown>]>([
      ['non-integer sats', { transactionId: TX_ID, amountSats: '10.5' }],
      ['zero sats', { transactionId: TX_ID, amountSats: '0' }],
      ['exponent sats', { transactionId: TX_ID, amountSats: '1e5' }],
      ['bad transactionId', { transactionId: 'tx-1', amountSats: '1' }],
      ['missing amount', { transactionId: TX_ID }],
    ])('400s on %s', async (_name, payload) => {
      const wallet = h.wallets.seed({ balanceSats: 5000 });
      const res = (await debit(wallet.id, payload)) as LightMyRequestResponse;
      expect(res.statusCode).toBe(400);
      expect(h.wallets.wallets.get(wallet.id)?.balanceSats).toBe(5000);
    });
  });

  describe('POST /internal/wallets/:id/credits (refund)', () => {
    it('refunds an applied debit exactly once', async () => {
      const wallet = h.wallets.seed({ balanceSats: 5000 });
      await debit(wallet.id, { transactionId: TX_ID, amountSats: '1200' });
      const first = (await credit(wallet.id, { transactionId: TX_ID, amountSats: '1200', reason: 'refund' })) as LightMyRequestResponse;
      const replay = (await credit(wallet.id, { transactionId: TX_ID, amountSats: '1200', reason: 'refund' })) as LightMyRequestResponse;
      expect(first.statusCode).toBe(200);
      expect(first.json().balanceCache).toBe('5000');
      expect(replay.json().balanceCache).toBe('5000');
      expect(h.wallets.wallets.get(wallet.id)?.balanceSats).toBe(5000);
    });

    it.each<[string, string, string]>([
      ['without any debit', OTHER_TX, '1200'],
      ['with a different amount than the debit', TX_ID, '1300'],
    ])('409s REFUND_WITHOUT_DEBIT %s (a refund can never mint funds)', async (_name, transactionId, amountSats) => {
      const wallet = h.wallets.seed({ balanceSats: 5000 });
      await debit(wallet.id, { transactionId: TX_ID, amountSats: '1200' });
      const res = (await credit(wallet.id, { transactionId, amountSats, reason: 'refund' })) as LightMyRequestResponse;
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ code: 'REFUND_WITHOUT_DEBIT' });
      expect(h.wallets.wallets.get(wallet.id)?.balanceSats).toBe(3800);
    });

    it('409s REFUND_WITHOUT_DEBIT against another wallet', async () => {
      const source = h.wallets.seed({ balanceSats: 5000 });
      const other = h.wallets.seed({ balanceSats: 0 });
      await debit(source.id, { transactionId: TX_ID, amountSats: '1200' });
      const res = (await credit(other.id, { transactionId: TX_ID, amountSats: '1200', reason: 'refund' })) as LightMyRequestResponse;
      expect(res.statusCode).toBe(409);
      expect(h.wallets.wallets.get(other.id)?.balanceSats).toBe(0);
    });

    it.each<[string, Record<string, unknown>]>([
      ['missing reason', { transactionId: TX_ID, amountSats: '1' }],
      ['reason other than refund', { transactionId: TX_ID, amountSats: '1', reason: 'deposit' }],
      ['non-integer sats', { transactionId: TX_ID, amountSats: '0.1', reason: 'refund' }],
    ])('400s on %s', async (_name, payload) => {
      const wallet = h.wallets.seed();
      expect(((await credit(wallet.id, payload)) as LightMyRequestResponse).statusCode).toBe(400);
    });
  });
});
