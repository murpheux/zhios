jest.mock('../../src/infrastructure/persistence/transaction.repository', () => ({
  MongooseTransactionRepository: jest.requireActual('../fakes/in-memory-adapters').InMemoryTransactionRepository,
}));
jest.mock('../../src/infrastructure/persistence/audit-log.repository', () => ({
  MongooseAuditLogRepository: jest.requireActual('../fakes/in-memory-adapters').InMemoryAuditLogRepository,
}));
jest.mock('../../src/infrastructure/persistence/system-event.repository', () => ({
  MongooseSystemEventRepository: jest.requireActual('../fakes/in-memory-adapters').InMemorySystemEventRepository,
}));
jest.mock('../../src/infrastructure/clients/wallet-service.client', () => ({
  WalletServiceHttpClient: jest.requireActual('../fakes/in-memory-adapters').FakeWalletService,
}));

import { BroadcastRejectedError } from '../../src/application/ports/bitcoin-node-client.port';
import { MockBitcoinNodeClient } from '../../src/infrastructure/clients/mock-bitcoin-node.client';
import { buildTestApp } from '../fakes/test-app';
import { MAINNET_P2WPKH, TESTNET_P2WSH } from '../helpers';

type Harness = Awaited<ReturnType<typeof buildTestApp>>;

const MISSING_ID = 'ffffffffffffffffffffffff';
// BIP-350 taproot (v1, bech32m) testnet vector.
const TESTNET_P2TR = 'tb1pqqqqp399et2xygdj5xreqhjjvcmzhxw4aywxecjdzew6hylgvsesf3hn0c';

describe('transaction routes (/api/v1)', () => {
  let h: Harness;
  let walletId: string;

  beforeEach(async () => {
    h = await buildTestApp();
    walletId = h.walletService.seed({ ownerUserId: 'alice', balanceSats: 1_000_000 }).id;
  });
  afterEach(async () => {
    await h.app.close();
    jest.restoreAllMocks();
  });

  const sendBody = (overrides: Record<string, unknown> = {}) => ({
    walletId,
    type: 'send',
    amount: '100000',
    feeRate: '12',
    destinationAddress: TESTNET_P2WSH,
    ...overrides,
  });

  const create = (payload: unknown, headers: Record<string, string> = {}) =>
    h.app.inject({ method: 'POST', url: '/api/v1/transactions', headers, payload });

  describe('authentication', () => {
    it.each<[string, string]>([
      ['POST', '/api/v1/transactions'],
      ['GET', '/api/v1/transactions'],
      ['GET', `/api/v1/transactions/${MISSING_ID}`],
      ['GET', `/api/v1/transactions/${MISSING_ID}/status`],
      ['POST', `/api/v1/transactions/${MISSING_ID}/validate`],
      ['POST', `/api/v1/transactions/${MISSING_ID}/broadcast`],
    ])('%s %s 401s before validation', async (method, url) => {
      const res = await h.app.inject({ method: method as 'GET', url, payload: method === 'POST' ? {} : undefined });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({ code: 'UNAUTHORIZED' });
    });
  });

  describe('POST /transactions', () => {
    it('builds, signs, persists and debits amount + fee; never returns rawTx', async () => {
      const res = await create(sendBody(), { ...h.bearer('alice'), 'idempotency-key': 'idem-key-0001' });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toMatchObject({
        walletId,
        type: 'send',
        amount: '100000',
        feeRate: '12',
        feeSats: String(12 * 141),
        status: 'pending',
        txid: null,
        destinationAddress: TESTNET_P2WSH,
        confirmations: 0,
      });
      expect(body).not.toHaveProperty('rawTx');
      expect(body).not.toHaveProperty('ownerUserId');
      expect(body).not.toHaveProperty('idempotencyKey');
      expect(h.walletService.wallets.get(walletId)?.balanceSats).toBe(1_000_000 - 100000 - 1692);
      expect(h.transactions.records.get(body.id)?.debitedAt).toBeInstanceOf(Date);
      expect(h.audit.entries.map((e) => e.action)).toEqual(['transaction.created']);
    });

    it('accepts a bech32m (taproot) destination', async () => {
      const res = await create(sendBody({ destinationAddress: TESTNET_P2TR }), {
        ...h.bearer('alice'),
        'idempotency-key': 'idem-key-taproot',
      });
      expect(res.statusCode).toBe(201);
    });

    it('replays the original transaction for the same Idempotency-Key and body (single debit)', async () => {
      const headers = { ...h.bearer('alice'), 'idempotency-key': 'idem-key-0002' };
      const first = await create(sendBody(), headers);
      const replay = await create(sendBody(), headers);
      expect(replay.statusCode).toBe(201);
      expect(replay.json().id).toBe(first.json().id);
      expect(h.transactions.records.size).toBe(1);
      expect(h.walletService.wallets.get(walletId)?.balanceSats).toBe(1_000_000 - 101692);
    });

    it('409s IDEMPOTENCY_CONFLICT when the key is reused with a different body', async () => {
      const headers = { ...h.bearer('alice'), 'idempotency-key': 'idem-key-0003' };
      await create(sendBody(), headers);
      const res = await create(sendBody({ amount: '200000' }), headers);
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    });

    it('scopes Idempotency-Keys per user', async () => {
      const bobWallet = h.walletService.seed({ ownerUserId: 'bob' }).id;
      await create(sendBody(), { ...h.bearer('alice'), 'idempotency-key': 'shared-key-01' });
      const res = await create(sendBody({ walletId: bobWallet }), { ...h.bearer('bob'), 'idempotency-key': 'shared-key-01' });
      expect(res.statusCode).toBe(201);
      expect(h.transactions.records.size).toBe(2);
    });

    it.each<[string, Record<string, unknown>, Record<string, string>]>([
      ['missing Idempotency-Key', {}, { 'idempotency-key': 'OMIT' }],
      ['short Idempotency-Key', {}, { 'idempotency-key': 'short' }],
      ['Idempotency-Key with spaces', {}, { 'idempotency-key': 'has spaces in it' }],
      ["type 'receive'", { type: 'receive' }, {}],
      ["type 'internal-transfer'", { type: 'internal-transfer' }, {}],
      ['missing type', { type: undefined }, {}],
      ['decimal amount', { amount: '1000.5' }, {}],
      ['zero amount', { amount: '0' }, {}],
      ['negative amount', { amount: '-1' }, {}],
      ['exponent amount', { amount: '1e8' }, {}],
      ['leading-zero amount', { amount: '0100' }, {}],
      ['17-digit amount', { amount: '12345678901234567' }, {}],
      ['feeRate 0', { feeRate: '0' }, {}],
      ['feeRate 10001', { feeRate: '10001' }, {}],
      ['feeRate decimal', { feeRate: '1.5' }, {}],
      ['feeRate negative', { feeRate: '-3' }, {}],
      ['malformed walletId', { walletId: 'not-an-object-id' }, {}],
      ['garbage address', { destinationAddress: 'not-an-address' }, {}],
      ['over-long address', { destinationAddress: `tb1q${'q'.repeat(90)}` }, {}],
      ['missing address', { destinationAddress: undefined }, {}],
    ])('400s on %s', async (_name, overrides, extraHeaders) => {
      const { 'idempotency-key': key = 'idem-key-0400', ...rest } = extraHeaders;
      const headers = { ...h.bearer('alice'), ...rest, ...(key === 'OMIT' ? {} : { 'idempotency-key': key }) };
      const res = await create(sendBody(overrides), headers);
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(h.transactions.records.size).toBe(0);
    });

    it.each<[string, string]>([
      ['the max fee rate (10000)', '10000'],
      ['the min fee rate (1)', '1'],
    ])('accepts %s', async (_name, feeRate) => {
      const wallet = h.walletService.wallets.get(walletId);
      if (wallet) wallet.balanceSats = 10_000_000;
      const res = await create(sendBody({ feeRate }), { ...h.bearer('alice'), 'idempotency-key': `fee-${feeRate}-key` });
      expect(res.statusCode).toBe(201);
    });

    it('400s when the address is valid-shaped but for another network (checksum/HRP check)', async () => {
      const res = await create(sendBody({ destinationAddress: MAINNET_P2WPKH }), {
        ...h.bearer('alice'),
        'idempotency-key': 'idem-key-0401',
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toMatch(/not a valid testnet address/);
    });

    it.each<[string, string, string[]]>([
      ['a stranger', 'bob', []],
      ['an admin (privileged read does not grant spending)', 'root', ['admin']],
      ['an auditor', 'carol', ['auditor']],
    ])('403s when %s spends from the wallet', async (_name, sub, roles) => {
      const res = await create(sendBody(), { ...h.bearer(sub, roles), 'idempotency-key': 'idem-key-0403' });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ code: 'FORBIDDEN' });
      expect(h.walletService.wallets.get(walletId)?.balanceSats).toBe(1_000_000);
    });

    it('403s for a wallet that does not exist (same answer as not-owned)', async () => {
      const res = await create(sendBody({ walletId: MISSING_ID }), { ...h.bearer('alice'), 'idempotency-key': 'idem-key-0404' });
      expect(res.statusCode).toBe(403);
    });

    it.each<[string, Record<string, unknown>, string]>([
      ['insufficient funds', { balanceSats: 1000 }, 'INSUFFICIENT_FUNDS'],
      ['suspended wallet', { status: 'suspended' }, 'WALLET_NOT_ACTIVE'],
      ['wallet on another network', { network: 'mainnet' }, 'NETWORK_MISMATCH'],
    ])('409s on %s', async (_name, walletOverrides, code) => {
      const id = h.walletService.seed({ ownerUserId: 'alice', ...walletOverrides }).id;
      const res = await create(sendBody({ walletId: id }), { ...h.bearer('alice'), 'idempotency-key': 'idem-key-0409' });
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ code });
    });

    it('marks an insufficient-funds send failed and re-raises the same 409 on replay', async () => {
      const id = h.walletService.seed({ ownerUserId: 'alice', balanceSats: 10 }).id;
      const headers = { ...h.bearer('alice'), 'idempotency-key': 'idem-key-0410' };
      await create(sendBody({ walletId: id }), headers);
      const [record] = h.transactions.records.values();
      expect(record).toMatchObject({ status: 'failed', failureReason: 'INSUFFICIENT_FUNDS', debitedAt: null });
      const replay = await create(sendBody({ walletId: id }), headers);
      expect(replay.statusCode).toBe(409);
      expect(replay.json()).toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
    });

    it('returns an opaque 500 when wallet-service is unreachable', async () => {
      h.walletService.failWith = new Error('connect ECONNREFUSED http://wallet-service:3001 secret-detail');
      const res = await create(sendBody(), { ...h.bearer('alice'), 'idempotency-key': 'idem-key-0500' });
      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ statusCode: 500, code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' });
      expect(res.body).not.toContain('secret-detail');
    });
  });

  describe('reads (privileged)', () => {
    it.each<[string, string, string[], number]>([
      ['owner', 'alice', [], 200],
      ['stranger', 'bob', [], 404],
      ['auditor', 'carol', ['auditor'], 200],
      ['admin', 'root', ['admin'], 200],
    ])('GET /transactions/:id as %s -> %d', async (_name, sub, roles, status) => {
      const tx = h.transactions.seed({ ownerUserId: 'alice' });
      const res = await h.app.inject({ method: 'GET', url: `/api/v1/transactions/${tx.id}`, headers: h.bearer(sub, roles) });
      expect(res.statusCode).toBe(status);
      if (status === 200) {
        expect(res.json()).toMatchObject({ id: tx.id, amount: '1000', feeSats: '282' });
        expect(res.json()).not.toHaveProperty('rawTx');
      }
    });

    it('400s on a malformed id', async () => {
      const res = await h.app.inject({ method: 'GET', url: '/api/v1/transactions/abc', headers: h.bearer('alice') });
      expect(res.statusCode).toBe(400);
    });

    it('lists only the caller’s transactions and applies filters', async () => {
      h.transactions.seed({ ownerUserId: 'alice', status: 'pending', createdAt: new Date('2024-01-01T00:00:00Z') });
      h.transactions.seed({ ownerUserId: 'alice', status: 'failed', createdAt: new Date('2024-03-01T00:00:00Z') });
      h.transactions.seed({ ownerUserId: 'bob', status: 'pending' });

      const all = await h.app.inject({ method: 'GET', url: '/api/v1/transactions', headers: h.bearer('alice') });
      expect(all.json()).toMatchObject({ total: 2, page: 1, limit: 20 });

      const filtered = await h.app.inject({
        method: 'GET',
        url: '/api/v1/transactions?status=failed&from=2024-02-01T00:00:00.000Z&to=2024-12-31T00:00:00.000Z',
        headers: h.bearer('alice'),
      });
      expect(filtered.json().total).toBe(1);
      expect(filtered.json().items[0].status).toBe('failed');

      const auditor = await h.app.inject({ method: 'GET', url: '/api/v1/transactions', headers: h.bearer('c', ['auditor']) });
      expect(auditor.json().total).toBe(3);
    });

    it.each(['status=done', 'from=yesterday', 'walletId=xyz', 'limit=500', 'page=0'])('400s on query %s', async (qs) => {
      const res = await h.app.inject({ method: 'GET', url: `/api/v1/transactions?${qs}`, headers: h.bearer('alice') });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /transactions/:id/validate', () => {
    it('200s for a funded pending transaction', async () => {
      const tx = h.transactions.seed({ ownerUserId: 'alice' });
      const res = await h.app.inject({ method: 'POST', url: `/api/v1/transactions/${tx.id}/validate`, headers: h.bearer('alice') });
      expect(res.statusCode).toBe(200);
    });

    it('400s with details for an unfunded transaction', async () => {
      const tx = h.transactions.seed({ ownerUserId: 'alice', debitedAt: null });
      const res = await h.app.inject({ method: 'POST', url: `/api/v1/transactions/${tx.id}/validate`, headers: h.bearer('alice') });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ code: 'VALIDATION_ERROR', details: { status: 'pending', fundsReserved: false } });
    });
  });

  describe('POST /transactions/:id/broadcast (owner-only write)', () => {
    const broadcast = (id: string, headers: Record<string, string>) =>
      h.app.inject({ method: 'POST', url: `/api/v1/transactions/${id}/broadcast`, headers });

    it('broadcasts once and records audit + system events', async () => {
      const tx = h.transactions.seed({ ownerUserId: 'alice' });
      const res = await broadcast(tx.id, h.bearer('alice'));
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ status: 'broadcast' });
      expect(res.json().txid).toMatch(/^[0-9a-f]{64}$/);
      expect(h.events.events.map((e) => e.eventType)).toContain('transaction.broadcast');

      const again = await broadcast(tx.id, h.bearer('alice'));
      expect(again.statusCode).toBe(409);
      expect(again.json()).toMatchObject({ code: 'INVALID_TRANSACTION_STATE' });
    });

    it.each<[string, string, string[], number, string]>([
      ['admin', 'root', ['admin'], 403, 'FORBIDDEN'],
      ['auditor', 'carol', ['auditor'], 403, 'FORBIDDEN'],
      ['stranger', 'bob', [], 404, 'NOT_FOUND'],
    ])('rejects a %s', async (_name, sub, roles, status, code) => {
      const tx = h.transactions.seed({ ownerUserId: 'alice' });
      const res = await broadcast(tx.id, h.bearer(sub, roles));
      expect(res.statusCode).toBe(status);
      expect(res.json()).toMatchObject({ code });
      expect(h.transactions.records.get(tx.id)?.status).toBe('pending');
    });

    it('refuses to broadcast an unfunded transaction', async () => {
      const tx = h.transactions.seed({ ownerUserId: 'alice', debitedAt: null });
      const res = await broadcast(tx.id, h.bearer('alice'));
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ code: 'INVALID_TRANSACTION_STATE' });
    });

    it('marks failed and refunds amount + fee when the node rejects it', async () => {
      jest.spyOn(MockBitcoinNodeClient.prototype, 'broadcast').mockRejectedValue(new BroadcastRejectedError('txn-mempool-conflict'));
      const wallet = h.walletService.wallets.get(walletId);
      if (wallet) wallet.balanceSats = 0;
      const tx = h.transactions.seed({ ownerUserId: 'alice', walletId, amount: '1000', feeSats: '282' });
      h.walletService.debits.set(tx.id, 1282);

      const res = await broadcast(tx.id, h.bearer('alice'));
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ code: 'BROADCAST_FAILED' });
      expect(res.json().message).toMatch(/funds were returned/);
      expect(h.walletService.wallets.get(walletId)?.balanceSats).toBe(1282);
      expect(h.transactions.records.get(tx.id)).toMatchObject({ status: 'failed', failureReason: 'BROADCAST_REJECTED' });
      expect(h.transactions.records.get(tx.id)?.refundedAt).toBeInstanceOf(Date);
    });

    it('stays broadcasting (no refund) when the node outcome is unknown', async () => {
      jest.spyOn(MockBitcoinNodeClient.prototype, 'broadcast').mockRejectedValue(new Error('socket timeout'));
      const tx = h.transactions.seed({ ownerUserId: 'alice', walletId });
      const res = await broadcast(tx.id, h.bearer('alice'));
      expect(res.statusCode).toBe(500);
      expect(h.transactions.records.get(tx.id)?.status).toBe('broadcasting');
      expect(h.events.events.map((e) => e.eventType)).toContain('transaction.broadcast_outcome_unknown');
    });
  });

  describe('GET /transactions/:id/status', () => {
    it('confirms a broadcast transaction once the node reports confirmations', async () => {
      const tx = h.transactions.seed({
        ownerUserId: 'alice',
        status: 'broadcast',
        txid: 'a'.repeat(64),
        broadcastAt: new Date(Date.now() - 120_000),
      });
      const res = await h.app.inject({ method: 'GET', url: `/api/v1/transactions/${tx.id}/status`, headers: h.bearer('alice') });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ transactionId: tx.id, status: 'confirmed', confirmations: 6 });
    });

    it('reports stored state for a pending transaction and 404s strangers', async () => {
      const tx = h.transactions.seed({ ownerUserId: 'alice' });
      const own = await h.app.inject({ method: 'GET', url: `/api/v1/transactions/${tx.id}/status`, headers: h.bearer('alice') });
      expect(own.json()).toEqual({ transactionId: tx.id, status: 'pending', confirmations: 0 });
      const other = await h.app.inject({ method: 'GET', url: `/api/v1/transactions/${tx.id}/status`, headers: h.bearer('bob') });
      expect(other.statusCode).toBe(404);
    });
  });
});
