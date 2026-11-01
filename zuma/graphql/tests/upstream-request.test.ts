import { TransactionServiceClient } from '../src/clients/transaction-service.client';
import { UpstreamHttpError } from '../src/clients/upstream-http-error';

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('upstream clients', () => {
  const fetchMock = jest.fn();
  const originalFetch = global.fetch;
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterAll(() => {
    global.fetch = originalFetch;
  });

  const client = new TransactionServiceClient({ baseUrl: 'http://tx', timeoutMs: 1234 });

  it('sends Idempotency-Key, the bearer token and an abort signal', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { id: '1' }));
    await client.createTransaction(
      { walletId: 'w', type: 'send', amount: '1', feeRate: '1', destinationAddress: 'a' },
      'key-12345678',
      'Bearer t',
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://tx/api/v1/transactions');
    expect(init.headers).toMatchObject({ 'idempotency-key': 'key-12345678', authorization: 'Bearer t' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('passes through upstream 4xx code/message', async () => {
    fetchMock.mockResolvedValue(jsonResponse(409, { code: 'INSUFFICIENT_FUNDS', message: 'Insufficient funds' }));
    await expect(client.getTransaction('1')).rejects.toMatchObject({
      statusCode: 409,
      code: 'INSUFFICIENT_FUNDS',
      message: 'Insufficient funds',
    });
  });

  it('hides upstream 5xx details', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { code: 'INTERNAL_ERROR', message: 'stack trace here' }));
    const error = await client.getTransaction('1').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UpstreamHttpError);
    expect(error).toMatchObject({ statusCode: 502, code: 'UPSTREAM_ERROR' });
    expect((error as Error).message).not.toContain('stack');
  });

  it('maps timeouts to UPSTREAM_TIMEOUT', async () => {
    fetchMock.mockRejectedValue(Object.assign(new Error('timed out'), { name: 'TimeoutError' }));
    await expect(client.getTransaction('1')).rejects.toMatchObject({ statusCode: 504, code: 'UPSTREAM_TIMEOUT' });
  });

  it('maps network errors to UPSTREAM_UNAVAILABLE', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    await expect(client.getTransaction('1')).rejects.toMatchObject({ statusCode: 502, code: 'UPSTREAM_UNAVAILABLE' });
  });
});
