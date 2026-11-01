import pino from 'pino';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { loadGraphqlGatewayConfig } from '../src/config/graphql-gateway-config';

// Full gateway (fastify + mercurius + resolvers + upstream clients) with fetch stubbed at the network edge.

const baseEnv = {
  MONGODB_URI: 'mongodb://unused',
  JWT_SECRET: 'test-user-jwt-secret-0123456789',
  INTERNAL_JWT_SECRET: 'test-internal-jwt-secret-0123456789abcdef',
  METRICS_ENABLED: 'false',
  NODE_ENV: 'production',
  WALLET_SERVICE_URL: 'http://wallet:3001',
  TRANSACTION_SERVICE_URL: 'http://tx:3002',
  UPSTREAM_TIMEOUT_MS: '1500',
};

const WALLET = {
  id: '6710f1f1c2a1b2c3d4e5f6a7',
  label: 'Main',
  address: 'tb1qexample',
  network: 'testnet',
  type: 'non-custodial',
  balanceCache: '150000',
  metadata: { tag: 'x' },
  ownerUserId: 'alice',
  status: 'suspended',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-02T00:00:00.000Z',
};

const TX = {
  id: '6710f1f1c2a1b2c3d4e5f6a8',
  walletId: WALLET.id,
  txid: null,
  type: 'internal-transfer',
  amount: '100000',
  feeRate: '12',
  status: 'broadcasting',
  confirmations: 0,
  rawTx: 'SECRET-RAW-TX',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const page = <T>(items: T[]) => ({ items, total: items.length, page: 1, limit: 20, totalPages: 1 });
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('graphql gateway (end to end)', () => {
  const fetchMock = jest.fn();
  const originalFetch = global.fetch;
  let app: FastifyInstance;

  const build = async (env: Record<string, string> = {}) =>
    buildApp({ config: loadGraphqlGatewayConfig({ ...baseEnv, ...env }), logger: pino({ level: 'silent' }) });

  beforeAll(async () => {
    global.fetch = fetchMock as unknown as typeof fetch;
    app = await build();
  });
  afterAll(async () => {
    global.fetch = originalFetch;
    await app.close();
  });
  beforeEach(() => fetchMock.mockReset());

  const gql = (query: string, variables?: Record<string, unknown>, headers: Record<string, string> = {}) =>
    app.inject({ method: 'POST', url: '/graphql', headers: { authorization: 'Bearer user-token', ...headers }, payload: { query, variables } });
  const call = (i = 0) => fetchMock.mock.calls[i] as [string, RequestInit & { headers: Record<string, string> }];

  it('wallet: forwards the bearer token and maps REST enums to GraphQL enums', async () => {
    fetchMock.mockResolvedValue(json(200, WALLET));
    const res = await gql('query($id: ID!) { wallet(id: $id) { id network type status balanceCache metadata ownerUserId } }', {
      id: WALLET.id,
    });
    expect(res.json()).toEqual({
      data: {
        wallet: {
          id: WALLET.id,
          network: 'TESTNET',
          type: 'NON_CUSTODIAL',
          status: 'SUSPENDED',
          balanceCache: '150000',
          metadata: { tag: 'x' },
          ownerUserId: 'alice',
        },
      },
    });
    const [url, init] = call();
    expect(url).toBe(`http://wallet:3001/api/v1/wallets/${WALLET.id}`);
    expect(init.headers).toMatchObject({ authorization: 'Bearer user-token', accept: 'application/json' });
    expect(init.method).toBe('GET');
  });

  it('wallets: passes pagination/owner filters and returns a connection', async () => {
    fetchMock.mockResolvedValue(json(200, page([WALLET])));
    const res = await gql('{ wallets(page: 2, limit: 5, ownerUserId: "bob") { items { id } pageInfo { total page limit totalPages } } }');
    expect(res.json().data.wallets).toEqual({
      items: [{ id: WALLET.id }],
      pageInfo: { total: 1, page: 1, limit: 20, totalPages: 1 },
    });
    expect(call()[0]).toBe('http://wallet:3001/api/v1/wallets?page=2&limit=5&ownerUserId=bob');
  });

  it('transaction: never exposes rawTx and maps enums', async () => {
    fetchMock.mockResolvedValue(json(200, TX));
    const res = await gql(`{ transaction(id: "${TX.id}") { id type status amount feeRate txid confirmations } }`);
    expect(res.json().data.transaction).toEqual({
      id: TX.id,
      type: 'INTERNAL_TRANSFER',
      status: 'BROADCASTING',
      amount: '100000',
      feeRate: '12',
      txid: null,
      confirmations: 0,
    });
    expect(res.body).not.toContain('SECRET-RAW-TX');
  });

  it('rawTx is not even part of the schema', async () => {
    const res = await gql(`{ transaction(id: "${TX.id}") { rawTx } }`);
    expect(res.json().errors[0].message).toMatch(/Cannot query field "rawTx"/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('transactions: maps the status enum back to the REST value and passes every filter', async () => {
    fetchMock.mockResolvedValue(json(200, page([TX])));
    const res = await gql(
      '{ transactions(walletId: "w1", status: CONFIRMED, from: "2024-01-01T00:00:00Z", to: "2024-02-01T00:00:00Z", page: 1, limit: 10) { pageInfo { total } } }',
    );
    expect(res.json().data.transactions.pageInfo.total).toBe(1);
    const url = new URL(call()[0]);
    expect(url.pathname).toBe('/api/v1/transactions');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      page: '1',
      limit: '10',
      walletId: 'w1',
      status: 'confirmed',
      from: '2024-01-01T00:00:00Z',
      to: '2024-02-01T00:00:00Z',
    });
  });

  it('createWallet: maps enums, passes literal JSON metadata and never lets the client set the owner', async () => {
    fetchMock.mockResolvedValue(json(201, WALLET));
    const res = await gql(
      'mutation { createWallet(input: { label: "Main", network: TESTNET, type: NON_CUSTODIAL, metadata: { n: 1, f: 1.5, b: true, s: "x", e: ENUMISH, l: [1, "two"], o: { nested: null } } }) { id } }',
    );
    expect(res.json().data.createWallet.id).toBe(WALLET.id);
    const [url, init] = call();
    expect(url).toBe('http://wallet:3001/api/v1/wallets');
    expect(init.method).toBe('POST');
    expect(init.headers['content-type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({
      label: 'Main',
      network: 'testnet',
      type: 'non-custodial',
      metadata: { n: 1, f: 1.5, b: true, s: 'x', e: 'ENUMISH', l: [1, 'two'], o: { nested: null } },
    });
  });

  it('createWallet: rejects an ownerUserId input field at validation time', async () => {
    const res = await gql('mutation { createWallet(input: { label: "L", network: MAINNET, type: HOT, ownerUserId: "x" }) { id } }');
    expect(res.json().errors[0].message).toMatch(/ownerUserId/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('createWallet: metadata via variables passes through parseValue', async () => {
    fetchMock.mockResolvedValue(json(201, WALLET));
    await gql('mutation($m: JSON) { createWallet(input: { label: "L", network: REGTEST, type: COLD, metadata: $m }) { id } }', {
      m: { deep: { list: [1, 2] } },
    });
    expect(JSON.parse(call()[1].body as string)).toMatchObject({ network: 'regtest', type: 'cold', metadata: { deep: { list: [1, 2] } } });
  });

  it('updateWalletMetadata: PATCHes only the provided fields', async () => {
    fetchMock.mockResolvedValue(json(200, { ...WALLET, label: 'Renamed' }));
    const res = await gql(`mutation { updateWalletMetadata(id: "${WALLET.id}", input: { label: "Renamed", metadata: null }) { label } }`);
    expect(res.json().data.updateWalletMetadata.label).toBe('Renamed');
    const [url, init] = call();
    expect(url).toBe(`http://wallet:3001/api/v1/wallets/${WALLET.id}/metadata`);
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ label: 'Renamed' });
  });

  it('createTransaction: forwards Idempotency-Key, forces type send, and maps the result', async () => {
    fetchMock.mockResolvedValue(json(201, { ...TX, type: 'send', status: 'pending' }));
    const res = await gql(
      'mutation($input: CreateTransactionInput!) { createTransaction(input: $input) { id type status } }',
      { input: { walletId: WALLET.id, amount: '100000', feeRate: '12', destinationAddress: 'tb1qdest', idempotencyKey: 'client-key-0001' } },
    );
    expect(res.json().data.createTransaction).toEqual({ id: TX.id, type: 'SEND', status: 'PENDING' });
    const [url, init] = call();
    expect(url).toBe('http://tx:3002/api/v1/transactions');
    expect(init.headers).toMatchObject({ 'idempotency-key': 'client-key-0001', authorization: 'Bearer user-token' });
    expect(JSON.parse(init.body as string)).toEqual({
      walletId: WALLET.id,
      amount: '100000',
      feeRate: '12',
      destinationAddress: 'tb1qdest',
      type: 'send',
    });
  });

  it.each<[string, Record<string, string>]>([
    ['bad idempotency key', { idempotencyKey: 'short' }],
    ['decimal amount', { amount: '0.5' }],
  ])('createTransaction: BAD_USER_INPUT on %s without calling upstream', async (_name, overrides) => {
    const res = await gql('mutation($input: CreateTransactionInput!) { createTransaction(input: $input) { id } }', {
      input: { walletId: 'w', amount: '1', feeRate: '1', destinationAddress: 'a', idempotencyKey: 'client-key-0001', ...overrides },
    });
    expect(res.json().errors[0].extensions).toMatchObject({ code: 'BAD_USER_INPUT', statusCode: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each<[string, () => Promise<Response>, Record<string, unknown>]>([
    ['upstream 409 code/message', async () => json(409, { code: 'INSUFFICIENT_FUNDS', message: 'Insufficient funds' }), { code: 'INSUFFICIENT_FUNDS', statusCode: 409 }],
    ['upstream 401', async () => json(401, { code: 'UNAUTHORIZED', message: 'Invalid or missing authentication token' }), { code: 'UNAUTHORIZED', statusCode: 401 }],
    ['upstream 5xx (hidden)', async () => json(500, { message: 'stack trace' }), { code: 'UPSTREAM_ERROR', statusCode: 502 }],
    ['network failure', async () => { throw new TypeError('fetch failed'); }, { code: 'UPSTREAM_UNAVAILABLE', statusCode: 502 }],
    ['timeout', async () => { throw Object.assign(new Error('timeout'), { name: 'TimeoutError' }); }, { code: 'UPSTREAM_TIMEOUT', statusCode: 504 }],
  ])('maps %s into GraphQL error extensions', async (_name, respond, extensions) => {
    fetchMock.mockImplementation(respond);
    const res = await gql(`{ wallet(id: "${WALLET.id}") { id } }`);
    const [error] = res.json().errors;
    expect(error.extensions).toMatchObject(extensions);
    expect(res.body).not.toContain('stack trace');
  });

  it('bounds every upstream call with the configured timeout', async () => {
    const timeout = jest.spyOn(AbortSignal, 'timeout');
    fetchMock.mockResolvedValue(json(200, WALLET));
    await gql(`{ wallet(id: "${WALLET.id}") { id } }`);
    expect(timeout).toHaveBeenCalledWith(1500);
    timeout.mockRestore();
  });

  it('sends no authorization header when the caller has none', async () => {
    fetchMock.mockResolvedValue(json(200, page([])));
    await app.inject({ method: 'POST', url: '/graphql', payload: { query: '{ wallets { pageInfo { total } } }' } });
    expect(call()[1].headers).not.toHaveProperty('authorization');
  });

  describe('probes and gating', () => {
    it('/readyz is 200 when both upstream /healthz answer', async () => {
      fetchMock.mockResolvedValue(new Response('{"status":"ok"}', { status: 200 }));
      const res = await app.inject({ method: 'GET', url: '/readyz' });
      expect(res.statusCode).toBe(200);
      expect(fetchMock.mock.calls.map(([url]) => url).sort()).toEqual(['http://tx:3002/healthz', 'http://wallet:3001/healthz']);
    });

    it('/readyz is 503 when an upstream is unhealthy', async () => {
      fetchMock.mockImplementation(async (url: string) =>
        new Response('{}', { status: url.startsWith('http://tx') ? 503 : 200 }),
      );
      expect((await app.inject({ method: 'GET', url: '/readyz' })).statusCode).toBe(503);
    });

    it('/healthz needs no upstream', async () => {
      expect((await app.inject({ method: 'GET', url: '/healthz' })).statusCode).toBe(200);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('allows introspection in production only when explicitly enabled', async () => {
      const introspective = await build({ GRAPHQL_INTROSPECTION_ENABLED: 'true' });
      const res = await introspective.inject({ method: 'POST', url: '/graphql', payload: { query: '{ __schema { queryType { name } } }' } });
      expect(res.json()).toEqual({ data: { __schema: { queryType: { name: 'Query' } } } });
      await introspective.close();
    });

    it('serves GraphiQL and introspection outside production', async () => {
      const dev = await build({ NODE_ENV: 'development' });
      expect((await dev.inject({ method: 'GET', url: '/graphiql' })).statusCode).toBe(200);
      const res = await dev.inject({ method: 'POST', url: '/graphql', payload: { query: '{ __typename }' } });
      expect(res.json()).toEqual({ data: { __typename: 'Query' } });
      await dev.close();
    });

    it('does not serve GraphiQL in production', async () => {
      expect((await app.inject({ method: 'GET', url: '/graphiql' })).statusCode).toBe(404);
    });

    it('gates /metrics behind METRICS_TOKEN in production', async () => {
      const token = 'metrics-token-0123456789';
      const metrics = await build({ METRICS_ENABLED: 'true', METRICS_TOKEN: token });
      expect((await metrics.inject({ method: 'GET', url: '/metrics' })).statusCode).toBe(401);
      expect((await metrics.inject({ method: 'GET', url: '/metrics', headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(200);
      await metrics.close();
    });

    it('rate limits by IP (mercurius formats the 429 as a GraphQL error)', async () => {
      const limited = await build({ RATE_LIMIT_MAX: '1' });
      fetchMock.mockResolvedValue(json(200, page([])));
      const send = () => limited.inject({ method: 'POST', url: '/graphql', payload: { query: '{ __typename }' } });
      expect((await send()).statusCode).toBe(200);
      const res = await send();
      expect(res.statusCode).toBe(429);
      expect(res.headers['retry-after']).toBeDefined();
      expect(res.json().errors[0].message).toMatch(/^Rate limit exceeded/);
      await limited.close();
    });
  });
});
