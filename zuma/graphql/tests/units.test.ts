const mockStartOtelFromEnv = jest.fn();
jest.mock('@zuma/shared-observability', () => ({
  ...jest.requireActual('@zuma/shared-observability'),
  startOtelFromEnv: mockStartOtelFromEnv,
}));

import { ErrorWithProps } from 'mercurius';
import { Kind, type ValueNode } from 'graphql';
import { WalletServiceClient } from '../src/clients/wallet-service.client';
import { TransactionServiceClient } from '../src/clients/transaction-service.client';
import { UpstreamHttpError } from '../src/clients/upstream-http-error';
import { upstreamHealthCheck, upstreamRequest } from '../src/clients/upstream-request';
import { loadGraphqlGatewayConfig } from '../src/config/graphql-gateway-config';
import { badUserInput, toGraphqlError } from '../src/resolvers/errors';
import { fromGraphqlEnum, toConnection, toGraphqlEnum } from '../src/resolvers/mappers';
import { resolvers } from '../src/resolvers';
import { jsonScalar } from '../src/schema/json-scalar';
import { transactionResolvers } from '../src/resolvers/transaction.resolvers';
import { walletResolvers } from '../src/resolvers/wallet.resolvers';
import type { GatewayContext } from '../src/context';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const fetchMock = jest.fn();
const originalFetch = global.fetch;
beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterAll(() => {
  global.fetch = originalFetch;
});

describe('upstreamRequest', () => {
  it('serializes JSON bodies and lets extra headers through', async () => {
    fetchMock.mockResolvedValue(json(200, { ok: true }));
    await upstreamRequest('svc', 'http://svc', '/x', { method: 'PUT', body: { a: 1 }, headers: { 'x-request-id': 'r1' } });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://svc/x');
    expect(init).toMatchObject({
      method: 'PUT',
      body: '{"a":1}',
      headers: { accept: 'application/json', 'content-type': 'application/json', 'x-request-id': 'r1' },
    });
  });

  it('defaults to GET with the default timeout and no body', async () => {
    const timeout = jest.spyOn(AbortSignal, 'timeout');
    fetchMock.mockResolvedValue(json(200, {}));
    await upstreamRequest('svc', 'http://svc', '/x', {});
    const init = (fetchMock.mock.calls[0] as [string, RequestInit])[1];
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    expect(init.headers).not.toHaveProperty('content-type');
    expect(timeout).toHaveBeenCalledWith(5000);
    timeout.mockRestore();
  });

  it.each<[string, () => Response, Record<string, unknown>]>([
    ['4xx without a JSON body', () => new Response('<html>', { status: 404 }), { statusCode: 404, code: 'UPSTREAM_REJECTED', message: 'svc rejected the request' }],
    ['4xx with non-string code/message', () => json(400, { code: 7, message: { x: 1 } }), { statusCode: 400, code: 'UPSTREAM_REJECTED', message: 'svc rejected the request' }],
    ['2xx with an invalid JSON body', () => new Response('not json', { status: 200 }), { statusCode: 502, code: 'UPSTREAM_BAD_RESPONSE' }],
    ['503', () => json(503, {}), { statusCode: 502, code: 'UPSTREAM_ERROR', message: 'svc failed to process the request' }],
  ])('maps %s', async (_name, respond, expected) => {
    fetchMock.mockImplementation(async () => respond());
    const error = await upstreamRequest('svc', 'http://svc', '/x', {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UpstreamHttpError);
    expect(error).toMatchObject(expected);
  });

  it('maps AbortError like a timeout', async () => {
    fetchMock.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    await expect(upstreamRequest('svc', 'http://svc', '/x', {})).rejects.toMatchObject({ statusCode: 504, code: 'UPSTREAM_TIMEOUT' });
  });

  it('maps non-Error rejections to UPSTREAM_UNAVAILABLE', async () => {
    fetchMock.mockRejectedValue('weird');
    await expect(upstreamRequest('svc', 'http://svc', '/x', {})).rejects.toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' });
  });
});

describe('upstreamHealthCheck', () => {
  it('resolves on 2xx and rejects otherwise', async () => {
    fetchMock.mockResolvedValueOnce(new Response('ok', { status: 200 })).mockResolvedValueOnce(new Response('', { status: 500 }));
    await expect(upstreamHealthCheck('svc', 'http://svc', 100)).resolves.toBeUndefined();
    await expect(upstreamHealthCheck('svc', 'http://svc', 100)).rejects.toThrow('svc /healthz returned 500');
    expect(fetchMock.mock.calls[0][0]).toBe('http://svc/healthz');
  });
});

describe('WalletServiceClient', () => {
  const client = new WalletServiceClient({ baseUrl: 'http://wallet' });

  it.each<[Parameters<WalletServiceClient['listWallets']>[0], string]>([
    [{}, 'http://wallet/api/v1/wallets'],
    [{ page: 3 }, 'http://wallet/api/v1/wallets?page=3'],
    [{ limit: 5, ownerUserId: 'a b' }, 'http://wallet/api/v1/wallets?limit=5&ownerUserId=a+b'],
  ])('listWallets(%j) -> %s', async (params, url) => {
    fetchMock.mockResolvedValue(json(200, { items: [] }));
    await client.listWallets(params, 'Bearer t');
    expect(fetchMock.mock.calls[0][0]).toBe(url);
  });

  it('URL-encodes ids', async () => {
    fetchMock.mockImplementation(async () => json(200, {}));
    await client.getWallet('a/b');
    await client.updateWalletMetadata('a/b', { label: 'x' });
    expect(fetchMock.mock.calls.map(([u]) => u)).toEqual(['http://wallet/api/v1/wallets/a%2Fb', 'http://wallet/api/v1/wallets/a%2Fb/metadata']);
  });

  it('health-checks /healthz with the default timeout', async () => {
    const timeout = jest.spyOn(AbortSignal, 'timeout');
    fetchMock.mockResolvedValue(new Response('ok'));
    await client.healthCheck();
    expect(timeout).toHaveBeenCalledWith(2000);
    timeout.mockRestore();
  });
});

describe('TransactionServiceClient', () => {
  const client = new TransactionServiceClient({ baseUrl: 'http://tx' });

  it.each<[Parameters<TransactionServiceClient['listTransactions']>[0], string]>([
    [{}, 'http://tx/api/v1/transactions'],
    [{ status: 'pending', walletId: 'w' }, 'http://tx/api/v1/transactions?walletId=w&status=pending'],
    [{ from: 'a', to: 'b', page: 1, limit: 2 }, 'http://tx/api/v1/transactions?page=1&limit=2&from=a&to=b'],
  ])('listTransactions(%j) -> %s', async (params, url) => {
    fetchMock.mockResolvedValue(json(200, { items: [] }));
    await client.listTransactions(params);
    expect(fetchMock.mock.calls[0][0]).toBe(url);
  });

  it('health-checks with the default timeout', async () => {
    const timeout = jest.spyOn(AbortSignal, 'timeout');
    fetchMock.mockResolvedValue(new Response('ok'));
    await client.healthCheck();
    expect(timeout).toHaveBeenCalledWith(2000);
    timeout.mockRestore();
  });

  it('URL-encodes transaction ids and health-checks', async () => {
    fetchMock.mockImplementation(async () => json(200, {}));
    await client.getTransaction('x?y');
    await client.healthCheck(10);
    expect(fetchMock.mock.calls.map(([u]) => u)).toEqual(['http://tx/api/v1/transactions/x%3Fy', 'http://tx/healthz']);
  });
});

describe('resolver error mapping', () => {
  it('passes ErrorWithProps through unchanged', () => {
    const original = badUserInput('nope');
    expect(() => toGraphqlError(original)).toThrow(original);
  });

  it('maps upstream errors to code + statusCode', () => {
    try {
      toGraphqlError(new UpstreamHttpError(409, 'INSUFFICIENT_FUNDS', 'Insufficient funds'));
    } catch (error) {
      expect(error).toBeInstanceOf(ErrorWithProps);
      expect(error).toMatchObject({ message: 'Insufficient funds', extensions: { code: 'INSUFFICIENT_FUNDS', statusCode: 409 } });
    }
    expect.assertions(2);
  });

  it('hides internal errors but keeps the cause for logging', () => {
    const cause = new Error('mongodb://secret');
    try {
      toGraphqlError(cause);
    } catch (error) {
      expect(error).toMatchObject({ message: 'Internal server error', extensions: { code: 'INTERNAL_ERROR' } });
      expect((error as { cause?: unknown }).cause).toBe(cause);
    }
    expect.assertions(2);
  });

  it.each<[string, () => Promise<unknown>]>([
    ['transaction', () => transactionResolvers.Query.transaction(undefined, { id: '1' }, ctxThatFails())],
    ['transactions', () => transactionResolvers.Query.transactions(undefined, {}, ctxThatFails())],
    [
      'createTransaction',
      () =>
        transactionResolvers.Mutation.createTransaction(
          undefined,
          { input: { walletId: 'w', amount: '1', feeRate: '1', destinationAddress: 'a', idempotencyKey: 'key-12345678' } },
          ctxThatFails(),
        ),
    ],
  ])('%s maps upstream failures', async (_name, run) => {
    await expect(run()).rejects.toMatchObject({ extensions: { code: 'UPSTREAM_UNAVAILABLE', statusCode: 502 } });
  });

  it.each<[string, (ctx: GatewayContext) => Promise<unknown>]>([
    ['wallets', (ctx) => walletResolvers.Query.wallets(undefined, {}, ctx)],
    ['createWallet', (ctx) => walletResolvers.Mutation.createWallet(undefined, { input: { label: 'L', network: 'TESTNET', type: 'HOT' } }, ctx)],
    ['updateWalletMetadata', (ctx) => walletResolvers.Mutation.updateWalletMetadata(undefined, { id: 'w', input: {} }, ctx)],
  ])('%s maps upstream failures', async (_name, run) => {
    const fail = jest.fn().mockRejectedValue(new UpstreamHttpError(404, 'NOT_FOUND', "Wallet with id 'w' was not found"));
    const ctx = {
      walletServiceClient: { listWallets: fail, createWallet: fail, updateWalletMetadata: fail },
      transactionServiceClient: {},
    } as unknown as GatewayContext;
    await expect(run(ctx)).rejects.toMatchObject({ extensions: { code: 'NOT_FOUND', statusCode: 404 } });
  });

  it('transactions omits the status filter when not given', async () => {
    const listTransactions = jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 20, totalPages: 1 });
    const ctx = { transactionServiceClient: { listTransactions } } as unknown as GatewayContext;
    await transactionResolvers.Query.transactions(undefined, { walletId: 'w' }, ctx);
    expect(listTransactions).toHaveBeenCalledWith({ walletId: 'w', status: undefined }, undefined);
  });
});

function ctxThatFails(): GatewayContext {
  const fail = jest.fn().mockRejectedValue(new UpstreamHttpError(502, 'UPSTREAM_UNAVAILABLE', 'transaction-service is unavailable'));
  return {
    walletServiceClient: {} as GatewayContext['walletServiceClient'],
    transactionServiceClient: { getTransaction: fail, listTransactions: fail, createTransaction: fail } as unknown as GatewayContext['transactionServiceClient'],
  };
}

describe('mappers', () => {
  it.each<[string, string]>([
    ['internal-transfer', 'INTERNAL_TRANSFER'],
    ['non-custodial', 'NON_CUSTODIAL'],
    ['testnet', 'TESTNET'],
    ['pending', 'PENDING'],
  ])('%s <-> %s', (rest, graphql) => {
    expect(toGraphqlEnum(rest)).toBe(graphql);
    expect(fromGraphqlEnum(graphql)).toBe(rest);
  });

  it('builds connections', () => {
    expect(toConnection({ items: [1, 2], total: 2, page: 1, limit: 2, totalPages: 1 }, (n) => n * 10)).toEqual({
      items: [10, 20],
      pageInfo: { total: 2, page: 1, limit: 2, totalPages: 1 },
    });
  });

  it('merges Query and Mutation resolvers with the JSON scalar', () => {
    expect(Object.keys(resolvers.Query).sort()).toEqual(['transaction', 'transactions', 'wallet', 'wallets']);
    expect(Object.keys(resolvers.Mutation).sort()).toEqual(['createTransaction', 'createWallet', 'updateWalletMetadata']);
    expect(resolvers.JSON).toBe(jsonScalar);
  });
});

describe('JSON scalar', () => {
  it('serializes and parses values unchanged', () => {
    const value = { a: [1, { b: null }] };
    expect(jsonScalar.serialize(value)).toBe(value);
    expect(jsonScalar.parseValue(value)).toBe(value);
  });

  it('returns undefined for unsupported literal kinds (variables)', () => {
    expect(jsonScalar.parseLiteral({ kind: Kind.VARIABLE, name: { kind: Kind.NAME, value: 'v' } } as ValueNode)).toBeUndefined();
  });
});

describe('graphql gateway config', () => {
  const base = {
    MONGODB_URI: 'mongodb://unused',
    JWT_SECRET: 'test-user-jwt-secret-0123456789',
    INTERNAL_JWT_SECRET: 'test-internal-jwt-secret-0123456789abcdef',
  };

  it('applies gateway defaults (PORT is optional here)', () => {
    expect(loadGraphqlGatewayConfig(base)).toMatchObject({
      PORT: 3003,
      SERVICE_NAME: 'graphql-gateway',
      WALLET_SERVICE_URL: 'http://localhost:3001',
      TRANSACTION_SERVICE_URL: 'http://localhost:3002',
      UPSTREAM_TIMEOUT_MS: 5000,
      GRAPHQL_QUERY_DEPTH: 8,
    });
    expect(loadGraphqlGatewayConfig(base).GRAPHQL_INTROSPECTION_ENABLED).toBeUndefined();
  });

  it.each<[string, boolean]>([
    ['true', true],
    ['false', false],
  ])('GRAPHQL_INTROSPECTION_ENABLED=%s', (value, expected) => {
    expect(loadGraphqlGatewayConfig({ ...base, GRAPHQL_INTROSPECTION_ENABLED: value }).GRAPHQL_INTROSPECTION_ENABLED).toBe(expected);
  });

  it.each([{ GRAPHQL_QUERY_DEPTH: '0' }, { UPSTREAM_TIMEOUT_MS: '-1' }, { GRAPHQL_INTROSPECTION_ENABLED: 'yes' }])('rejects %j', (overrides) => {
    expect(() => loadGraphqlGatewayConfig({ ...base, ...overrides })).toThrow(/Invalid environment configuration/);
  });

  it('reads process.env by default', () => {
    const original = process.env;
    process.env = { ...base, SERVICE_NAME: 'from-env' };
    try {
      expect(loadGraphqlGatewayConfig().SERVICE_NAME).toBe('from-env');
    } finally {
      process.env = original;
    }
  });
});

describe('otel entrypoint', () => {
  it('starts OTel from env under the graphql-gateway name', () => {
    jest.isolateModules(() => {
      require('../src/otel');
    });
    expect(mockStartOtelFromEnv).toHaveBeenCalledWith('graphql-gateway');
  });
});
