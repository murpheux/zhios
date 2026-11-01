import { WalletServiceHttpClient } from '../src/infrastructure/clients/wallet-service.client';
import { WalletOwnershipHttpClient } from '../src/infrastructure/clients/wallet-ownership.client';
import { MockBitcoinNodeClient } from '../src/infrastructure/clients/mock-bitcoin-node.client';

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

describe('WalletServiceHttpClient', () => {
  const sign = jest.fn((audience: string) => `token-for-${audience}`);
  const build = (overrides: Partial<ConstructorParameters<typeof WalletServiceHttpClient>[0]> = {}) =>
    new WalletServiceHttpClient({
      baseUrl: 'http://wallet:3001',
      tokenSigner: { sign },
      retryBaseDelayMs: 1,
      ...overrides,
    });
  const movement = { walletId: 'w/1', transactionId: 'tx1', amountSats: '1500' };

  beforeEach(() => sign.mockClear());

  describe('getWallet', () => {
    it('GETs the internal summary with a fresh service token per attempt and a timeout signal', async () => {
      fetchMock.mockResolvedValue(json(200, { id: 'w1', ownerUserId: 'u1' }));
      expect(await build().getWallet('w/1')).toEqual({ id: 'w1', ownerUserId: 'u1' });
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://wallet:3001/internal/wallets/w%2F1');
      expect(init).toMatchObject({ method: 'GET', headers: { 'x-service-token': 'token-for-wallet-service' }, body: undefined });
      expect(init.headers).not.toHaveProperty('authorization');
      expect(init.headers).not.toHaveProperty('content-type');
      expect(init.signal).toBeInstanceOf(AbortSignal);
    });

    it('returns null on 404', async () => {
      fetchMock.mockResolvedValue(json(404, { code: 'NOT_FOUND' }));
      expect(await build().getWallet('w1')).toBeNull();
    });

    it.each([400, 401, 403])('throws on non-retryable %d without retrying', async (status) => {
      fetchMock.mockResolvedValue(json(status, {}));
      await expect(build().getWallet('w1')).rejects.toThrow(`wallet-service responded with ${status}`);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('uses a custom audience', async () => {
      fetchMock.mockResolvedValue(json(200, {}));
      await build({ audience: 'wallet-svc-blue' }).getWallet('w1');
      expect(sign).toHaveBeenCalledWith('wallet-svc-blue');
    });
  });

  describe('retries', () => {
    it.each([429, 500, 502, 503])('retries %d with exponential backoff, then succeeds', async (status) => {
      fetchMock.mockResolvedValueOnce(json(status, {})).mockResolvedValueOnce(json(200, { id: 'w1' }));
      const timeout = jest.spyOn(global, 'setTimeout');
      expect(await build({ retryBaseDelayMs: 5 }).getWallet('w1')).toEqual({ id: 'w1' });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(sign).toHaveBeenCalledTimes(2);
      expect(timeout.mock.calls.some(([, ms]) => ms === 5)).toBe(true);
      timeout.mockRestore();
    });

    it('doubles the delay on each attempt', async () => {
      fetchMock.mockResolvedValue(json(503, {}));
      const timeout = jest.spyOn(global, 'setTimeout');
      await expect(build({ retryBaseDelayMs: 3, maxAttempts: 3 }).getWallet('w1')).rejects.toThrow('503');
      const delays = timeout.mock.calls.map(([, ms]) => ms).filter((ms) => ms === 3 || ms === 6 || ms === 12);
      expect(delays).toEqual([3, 6]);
      timeout.mockRestore();
    });

    it('returns the last retryable response after maxAttempts', async () => {
      fetchMock.mockResolvedValue(json(503, {}));
      await expect(build({ maxAttempts: 3 }).getWallet('w1')).rejects.toThrow('wallet-service responded with 503');
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('retries network errors and timeouts, then rethrows the last error', async () => {
      const timeoutError = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
      fetchMock.mockRejectedValueOnce(new TypeError('fetch failed')).mockRejectedValueOnce(timeoutError);
      await expect(build({ maxAttempts: 2 }).getWallet('w1')).rejects.toBe(timeoutError);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('wraps non-Error throwables', async () => {
      fetchMock.mockRejectedValue('boom');
      await expect(build({ maxAttempts: 1 }).getWallet('w1')).rejects.toThrow('wallet-service request failed');
    });

    it.each<[number | undefined, number]>([
      [undefined, 3],
      [0, 1],
      [-5, 1],
      [1, 1],
    ])('maxAttempts=%p -> %d attempts', async (maxAttempts, attempts) => {
      fetchMock.mockRejectedValue(new TypeError('fetch failed'));
      await expect(build({ maxAttempts }).getWallet('w1')).rejects.toThrow('fetch failed');
      expect(fetchMock).toHaveBeenCalledTimes(attempts);
    });

    it('applies the configured timeout to every attempt', async () => {
      const timeoutSpy = jest.spyOn(AbortSignal, 'timeout');
      fetchMock.mockImplementation(async () => json(200, {}));
      await build({ timeoutMs: 750 }).getWallet('w1');
      await build().getWallet('w1');
      expect(timeoutSpy.mock.calls.map(([ms]) => ms)).toEqual([750, 2000]);
      timeoutSpy.mockRestore();
    });
  });

  describe('debit / refund', () => {
    it('POSTs a JSON debit and returns the new balance', async () => {
      fetchMock.mockResolvedValue(json(200, { walletId: 'w/1', balanceCache: '8500' }));
      expect(await build().debit(movement)).toEqual({ ok: true, balanceCache: '8500' });
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://wallet:3001/internal/wallets/w%2F1/debits');
      expect(init).toMatchObject({ method: 'POST', headers: { 'content-type': 'application/json' } });
      expect(JSON.parse(init.body as string)).toEqual({ transactionId: 'tx1', amountSats: '1500' });
    });

    it('POSTs a refund credit with reason=refund', async () => {
      fetchMock.mockResolvedValue(json(200, { balanceCache: '10000' }));
      expect(await build().refund(movement)).toEqual({ ok: true, balanceCache: '10000' });
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://wallet:3001/internal/wallets/w%2F1/credits');
      expect(JSON.parse(init.body as string)).toEqual({ transactionId: 'tx1', amountSats: '1500', reason: 'refund' });
    });

    it('maps 404 to WALLET_NOT_FOUND', async () => {
      fetchMock.mockResolvedValue(json(404, {}));
      expect(await build().debit(movement)).toEqual({ ok: false, code: 'WALLET_NOT_FOUND', message: 'Wallet was not found' });
    });

    it.each(['INSUFFICIENT_FUNDS', 'WALLET_NOT_ACTIVE', 'WALLET_NOT_FOUND', 'IDEMPOTENCY_CONFLICT', 'REFUND_WITHOUT_DEBIT'])(
      'maps a 409 %s to a definitive rejection (no retry)',
      async (code) => {
        fetchMock.mockResolvedValue(json(409, { code, message: `msg ${code}` }));
        expect(await build().debit(movement)).toEqual({ ok: false, code, message: `msg ${code}` });
        expect(fetchMock).toHaveBeenCalledTimes(1);
      },
    );

    it('falls back to the code as message', async () => {
      fetchMock.mockResolvedValue(json(409, { code: 'INSUFFICIENT_FUNDS' }));
      expect(await build().debit(movement)).toEqual({ ok: false, code: 'INSUFFICIENT_FUNDS', message: 'INSUFFICIENT_FUNDS' });
    });

    it.each<[string, Response]>([
      ['unknown 409 code', json(409, { code: 'SOMETHING_ELSE' })],
      ['409 without a body', new Response('not json', { status: 409 })],
      ['400', json(400, { code: 'VALIDATION_ERROR' })],
    ])('throws (outcome unknown) on %s', async (_name, response) => {
      fetchMock.mockResolvedValue(response);
      await expect(build().debit(movement)).rejects.toThrow(/wallet-service responded with/);
    });

    it('throws after exhausting retries on 5xx (caller must not assume failure)', async () => {
      fetchMock.mockResolvedValue(json(500, {}));
      await expect(build().refund(movement)).rejects.toThrow('wallet-service responded with 500');
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
  });
});

describe('WalletOwnershipHttpClient (deprecated)', () => {
  const client = new WalletOwnershipHttpClient({ baseUrl: 'http://wallet:3001' });

  it.each<[number, boolean]>([
    [200, true],
    [404, false],
  ])('status %d -> owner=%p', async (status, owner) => {
    fetchMock.mockResolvedValue(json(status, {}));
    expect(await client.isOwner('w 1', 'u1', 'Bearer t')).toBe(owner);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://wallet:3001/api/v1/wallets/w%201');
    expect(init.headers).toEqual({ authorization: 'Bearer t' });
  });

  it('throws on other failures and sends no headers without a token', async () => {
    fetchMock.mockResolvedValue(json(500, {}));
    await expect(client.isOwner('w1', 'u1')).rejects.toThrow('wallet-service responded with 500');
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].headers).toBeUndefined();
  });
});

describe('MockBitcoinNodeClient', () => {
  const node = new MockBitcoinNodeClient();

  it.each<[number, number]>([
    [1, 141],
    [12, 1692],
    [10000, 1_410_000],
  ])('builds with feeSats = feeRate(%d) x 141 vB', async (feeRate, feeSats) => {
    const built = await node.build({ walletId: 'w1', network: 'testnet', amountSats: 5000, feeRate, destinationAddress: 'tb1q' });
    expect(built.feeSats).toBe(feeSats);
    expect(built.rawTx).toMatch(/^rawtx:w1:5000:[0-9a-f]{16}$/);
  });

  it('signs by suffixing the raw tx', async () => {
    expect(await node.sign('rawtx:abc')).toEqual({ rawTx: 'rawtx:abc:signed' });
  });

  it('broadcast returns a random 32-byte hex txid', async () => {
    const [a, b] = await Promise.all([node.broadcast('x'), node.broadcast('x')]);
    expect(a.txid).toMatch(/^[0-9a-f]{64}$/);
    expect(a.txid).not.toBe(b.txid);
  });

  it.each<[number | null, number]>([
    [null, 0],
    [0, 0],
    [9_999, 0],
    [10_000, 1],
    [35_000, 3],
    [60_000, 6],
    [3_600_000, 6],
  ])('confirmations for broadcast %p ms ago -> %d (capped at 6)', async (ageMs, expected) => {
    const now = 1_700_000_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const broadcastAt = ageMs === null ? null : new Date(now - ageMs);
    expect(await node.getConfirmations('txid', broadcastAt)).toBe(expected);
    jest.restoreAllMocks();
  });
});
