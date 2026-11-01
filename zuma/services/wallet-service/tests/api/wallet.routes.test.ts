jest.mock('../../src/infrastructure/persistence/wallet.repository', () => ({
  MongooseWalletRepository: jest.requireActual('../fakes/in-memory-repositories').InMemoryWalletRepository,
}));
jest.mock('../../src/infrastructure/persistence/ledger.repository', () => ({
  MongooseLedgerRepository: jest.requireActual('../fakes/in-memory-repositories').InMemoryLedgerRepository,
}));
jest.mock('../../src/infrastructure/clients/transaction-history.client', () => ({
  TransactionHistoryHttpClient: jest.requireActual('../fakes/in-memory-repositories').FakeTransactionHistoryClient,
}));

import { buildTestApp } from '../fakes/test-app';

type Harness = Awaited<ReturnType<typeof buildTestApp>>;

const MISSING_ID = 'ffffffffffffffffffffffff';

describe('wallet routes (/api/v1)', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await buildTestApp();
  });
  afterEach(async () => {
    await h.app.close();
  });

  describe('authentication', () => {
    it.each<[string, string]>([
      ['POST', '/api/v1/wallets'],
      ['GET', '/api/v1/wallets'],
      ['GET', `/api/v1/wallets/${MISSING_ID}`],
      ['PATCH', `/api/v1/wallets/${MISSING_ID}/metadata`],
      ['GET', `/api/v1/wallets/${MISSING_ID}/balance`],
      ['GET', `/api/v1/wallets/${MISSING_ID}/transactions`],
      ['POST', `/api/v1/admin/wallets/${MISSING_ID}/deposits`],
    ])('%s %s requires a bearer token', async (method, url) => {
      const res = await h.app.inject({ method: method as 'GET', url, payload: method === 'GET' ? undefined : {} });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('rejects a service token in place of a user token', async () => {
      const res = await h.app.inject({
        method: 'GET',
        url: '/api/v1/wallets',
        headers: h.serviceHeaders('transaction-service'),
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /wallets', () => {
    it('creates a wallet owned by the caller (body ownerUserId ignored) with a zero sats balance', async () => {
      const res = await h.app.inject({
        method: 'POST',
        url: '/api/v1/wallets',
        headers: h.bearer('alice'),
        payload: { label: 'Main', network: 'testnet', type: 'hot', metadata: { tag: 'x' }, ownerUserId: 'mallory' },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toMatchObject({
        label: 'Main',
        network: 'testnet',
        type: 'hot',
        ownerUserId: 'alice',
        balanceCache: '0',
        status: 'active',
        metadata: { tag: 'x' },
      });
      expect(body.address).toMatch(/^tb1q[02-9ac-hj-np-z]{38}$/);
      expect(body).not.toHaveProperty('balanceSats');
      expect(h.wallets.wallets.get(body.id)?.ownerUserId).toBe('alice');
    });

    it.each<[string, Record<string, unknown>]>([
      ['missing label', { network: 'testnet', type: 'hot' }],
      ['empty label', { label: '', network: 'testnet', type: 'hot' }],
      ['unknown network', { label: 'L', network: 'signet', type: 'hot' }],
      ['unknown type', { label: 'L', network: 'testnet', type: 'paper' }],
    ])('400s on %s', async (_name, payload) => {
      const res = await h.app.inject({ method: 'POST', url: '/api/v1/wallets', headers: h.bearer('alice'), payload });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    });
  });

  describe('GET /wallets/:id (privileged read)', () => {
    it.each<[string, string, string[], number]>([
      ['owner', 'alice', [], 200],
      ['stranger', 'bob', [], 404],
      ['auditor', 'carol', ['auditor'], 200],
      ['admin', 'dave', ['admin'], 200],
    ])('%s -> %d', async (_name, sub, roles, status) => {
      const wallet = h.wallets.seed({ ownerUserId: 'alice', balanceSats: 2_100_000_000_000_000 });
      const res = await h.app.inject({ method: 'GET', url: `/api/v1/wallets/${wallet.id}`, headers: h.bearer(sub, roles) });
      expect(res.statusCode).toBe(status);
      if (status === 200) {
        expect(res.json()).toMatchObject({ id: wallet.id, balanceCache: '2100000000000000' });
        expect(res.json().createdAt).toBe('2024-01-01T00:00:00.000Z');
      } else {
        expect(res.json()).toMatchObject({ code: 'NOT_FOUND' });
      }
    });

    it('404s for a missing wallet', async () => {
      const res = await h.app.inject({ method: 'GET', url: `/api/v1/wallets/${MISSING_ID}`, headers: h.bearer('alice') });
      expect(res.statusCode).toBe(404);
    });

    it.each(['not-an-id', '6710F1F1C2A1B2C3D4E5F6A7', '6710f1f1c2a1b2c3d4e5f6a'])('400s on malformed id %p', async (id) => {
      const res = await h.app.inject({ method: 'GET', url: `/api/v1/wallets/${id}`, headers: h.bearer('alice') });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    });
  });

  describe('GET /wallets (scoped listing)', () => {
    beforeEach(() => {
      h.wallets.seed({ ownerUserId: 'alice', label: 'a1' });
      h.wallets.seed({ ownerUserId: 'alice', label: 'a2' });
      h.wallets.seed({ ownerUserId: 'bob', label: 'b1' });
    });

    it('lists only the caller’s wallets even when filtering by another owner', async () => {
      const res = await h.app.inject({
        method: 'GET',
        url: '/api/v1/wallets?ownerUserId=bob',
        headers: h.bearer('alice'),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.items.map((w: { label: string }) => w.label)).toEqual(['a1', 'a2']);
      expect(body).toMatchObject({ total: 2, page: 1, limit: 20, totalPages: 1 });
      expect(body.items[0].balanceCache).toBe('0');
    });

    it.each<[string, string, number]>([
      ['all wallets for an admin', '', 3],
      ['the requested owner for an auditor', '?ownerUserId=bob', 1],
    ])('lists %s', async (_name, qs, total) => {
      const res = await h.app.inject({ method: 'GET', url: `/api/v1/wallets${qs}`, headers: h.bearer('root', ['admin', 'auditor']) });
      expect(res.json().total).toBe(total);
    });

    it('paginates', async () => {
      const res = await h.app.inject({ method: 'GET', url: '/api/v1/wallets?page=2&limit=1', headers: h.bearer('alice') });
      expect(res.json()).toMatchObject({ page: 2, limit: 1, total: 2, totalPages: 2 });
      expect(res.json().items).toHaveLength(1);
    });

    it.each(['limit=0', 'limit=101', 'page=0', 'page=abc'])('400s on %s', async (qs) => {
      const res = await h.app.inject({ method: 'GET', url: `/api/v1/wallets?${qs}`, headers: h.bearer('alice') });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('PATCH /wallets/:id/metadata (owner-only write)', () => {
    it.each<[string, string, string[], number, string | undefined]>([
      ['owner', 'alice', [], 200, undefined],
      ['admin (can read, cannot write)', 'dave', ['admin'], 403, 'FORBIDDEN'],
      ['auditor', 'carol', ['auditor'], 403, 'FORBIDDEN'],
      ['stranger', 'bob', [], 404, 'NOT_FOUND'],
    ])('%s -> %d', async (_name, sub, roles, status, code) => {
      const wallet = h.wallets.seed({ ownerUserId: 'alice', label: 'Old' });
      const res = await h.app.inject({
        method: 'PATCH',
        url: `/api/v1/wallets/${wallet.id}/metadata`,
        headers: h.bearer(sub, roles),
        payload: { label: 'New', metadata: { k: 1 } },
      });
      expect(res.statusCode).toBe(status);
      if (code) {
        expect(res.json()).toMatchObject({ code });
        expect(h.wallets.wallets.get(wallet.id)?.label).toBe('Old');
      } else {
        expect(res.json()).toMatchObject({ label: 'New', metadata: { k: 1 } });
      }
    });

    it('400s on an empty label', async () => {
      const wallet = h.wallets.seed({ ownerUserId: 'alice' });
      const res = await h.app.inject({
        method: 'PATCH',
        url: `/api/v1/wallets/${wallet.id}/metadata`,
        headers: h.bearer('alice'),
        payload: { label: '' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /wallets/:id/balance', () => {
    it.each<[string, string[], number]>([
      ['alice', [], 200],
      ['bob', [], 404],
      ['carol', ['auditor'], 200],
    ])('%s %j -> %d', async (sub, roles, status) => {
      const wallet = h.wallets.seed({ ownerUserId: 'alice', balanceSats: 12345 });
      const res = await h.app.inject({ method: 'GET', url: `/api/v1/wallets/${wallet.id}/balance`, headers: h.bearer(sub, roles) });
      expect(res.statusCode).toBe(status);
      if (status === 200) expect(res.json()).toEqual({ walletId: wallet.id, balanceCache: '12345' });
    });
  });

  describe('GET /wallets/:id/transactions', () => {
    it('forwards the caller’s bearer token to transaction-service for the owner', async () => {
      const wallet = h.wallets.seed({ ownerUserId: 'alice' });
      h.history.history = [
        {
          id: 'tx1',
          walletId: wallet.id,
          txid: null,
          type: 'send',
          amount: '1000',
          feeRate: '2',
          status: 'pending',
          confirmations: 0,
          rawTx: null,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ];
      const headers = h.bearer('alice');
      const res = await h.app.inject({ method: 'GET', url: `/api/v1/wallets/${wallet.id}/transactions`, headers });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toHaveLength(1);
      expect(h.history.calls).toEqual([{ walletId: wallet.id, authorization: headers.authorization }]);
    });

    it('404s for non-owners without calling transaction-service', async () => {
      const wallet = h.wallets.seed({ ownerUserId: 'alice' });
      const res = await h.app.inject({ method: 'GET', url: `/api/v1/wallets/${wallet.id}/transactions`, headers: h.bearer('bob') });
      expect(res.statusCode).toBe(404);
      expect(h.history.calls).toHaveLength(0);
    });
  });

  describe('POST /admin/wallets/:id/deposits', () => {
    const deposit = (id: string, headers: Record<string, string>, payload: unknown) =>
      h.app.inject({ method: 'POST', url: `/api/v1/admin/wallets/${id}/deposits`, headers, payload });

    it.each<[string, string[]]>([
      ['user', []],
      ['auditor', ['auditor']],
    ])('403s for a %s', async (_name, roles) => {
      const wallet = h.wallets.seed();
      const res = await deposit(wallet.id, h.bearer('x', roles), { amountSats: '1000', reference: 'ref-1' });
      expect(res.statusCode).toBe(403);
      expect(h.wallets.wallets.get(wallet.id)?.balanceSats).toBe(0);
    });

    it('credits the wallet once per reference (idempotent replay)', async () => {
      const wallet = h.wallets.seed({ balanceSats: 500 });
      const admin = h.bearer('root', ['admin']);
      const first = await deposit(wallet.id, admin, { amountSats: '1000', reference: 'faucet:2026-10-31.001' });
      const replay = await deposit(wallet.id, admin, { amountSats: '1000', reference: 'faucet:2026-10-31.001' });
      expect(first.statusCode).toBe(200);
      expect(first.json()).toEqual({ walletId: wallet.id, balanceCache: '1500' });
      expect(replay.json()).toEqual({ walletId: wallet.id, balanceCache: '1500' });
      expect(h.wallets.wallets.get(wallet.id)?.balanceSats).toBe(1500);
    });

    it('409s IDEMPOTENCY_CONFLICT when a reference is reused with another amount', async () => {
      const wallet = h.wallets.seed();
      const admin = h.bearer('root', ['admin']);
      await deposit(wallet.id, admin, { amountSats: '1000', reference: 'ref-1' });
      const res = await deposit(wallet.id, admin, { amountSats: '2000', reference: 'ref-1' });
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    });

    it('404s for a missing wallet', async () => {
      const res = await deposit(MISSING_ID, h.bearer('root', ['admin']), { amountSats: '1', reference: 'r' });
      expect(res.statusCode).toBe(404);
      expect(h.ledger.entries.size).toBe(0);
    });

    it.each<[string, Record<string, unknown>]>([
      ['decimal sats', { amountSats: '10.5', reference: 'r' }],
      ['zero sats', { amountSats: '0', reference: 'r' }],
      ['negative sats', { amountSats: '-5', reference: 'r' }],
      ['fractional number sats', { amountSats: 10.5, reference: 'r' }],
      ['leading zero', { amountSats: '01', reference: 'r' }],
      ['17 digits', { amountSats: '12345678901234567', reference: 'r' }],
      ['missing reference', { amountSats: '1' }],
      ['reference with spaces', { amountSats: '1', reference: 'has space' }],
      ['reference too long', { amountSats: '1', reference: 'r'.repeat(129) }],
    ])('400s on %s', async (_name, payload) => {
      const wallet = h.wallets.seed();
      const res = await deposit(wallet.id, h.bearer('root', ['admin']), payload);
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('400s (use-case check) for an amount above max supply that passes the wire pattern', async () => {
      const wallet = h.wallets.seed();
      const res = await deposit(wallet.id, h.bearer('root', ['admin']), { amountSats: '9999999999999999', reference: 'r' });
      expect(res.statusCode).toBe(400);
      expect(h.wallets.wallets.get(wallet.id)?.balanceSats).toBe(0);
    });
  });

  describe('error mapping', () => {
    it('returns an opaque 500 when the repository fails', async () => {
      h.wallets.failWith = new Error('MongoServerError: connect ECONNREFUSED mongodb://admin:hunter2@db');
      const res = await h.app.inject({ method: 'GET', url: '/api/v1/wallets', headers: h.bearer('alice') });
      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ statusCode: 500, code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' });
      expect(res.body).not.toContain('hunter2');
    });

    it('404s unknown routes', async () => {
      const res = await h.app.inject({ method: 'GET', url: '/api/v1/nope', headers: h.bearer('alice') });
      expect(res.statusCode).toBe(404);
    });
  });
});
