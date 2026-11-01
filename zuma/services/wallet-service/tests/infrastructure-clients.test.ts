import { MockAddressGenerator } from '../src/infrastructure/clients/mock-address-generator';
import { TransactionHistoryHttpClient } from '../src/infrastructure/clients/transaction-history.client';
import type { WalletNetwork } from '../src/domain/value-objects/network';

// Independent BIP-173 checksum verification for the generated addresses.
const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
const bech32Polymod = (values: number[]) => {
  let chk = 1;
  for (const v of values) {
    const b = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i += 1) if ((b >>> i) & 1) chk ^= GEN[i] as number;
  }
  return chk >>> 0;
};
const verifyBech32 = (address: string, hrp: string) => {
  const sep = address.lastIndexOf('1');
  if (address.slice(0, sep) !== hrp) return false;
  const data = [...address.slice(sep + 1)].map((c) => CHARSET.indexOf(c));
  const expanded = [...[...hrp].map((c) => c.charCodeAt(0) >> 5), 0, ...[...hrp].map((c) => c.charCodeAt(0) & 31)];
  return !data.includes(-1) && bech32Polymod([...expanded, ...data]) === 1;
};

describe('MockAddressGenerator', () => {
  const generator = new MockAddressGenerator();

  it.each<[WalletNetwork, string]>([
    ['mainnet', 'bc'],
    ['testnet', 'tb'],
    ['regtest', 'bcrt'],
  ])('emits checksum-valid P2WPKH (v0, 20-byte) addresses for %s', async (network, hrp) => {
    for (let i = 0; i < 20; i += 1) {
      const address = await generator.generate(network);
      expect(address.startsWith(`${hrp}1q`)).toBe(true);
      // hrp + '1' + version + 32 program words + 6 checksum words
      expect(address).toHaveLength(hrp.length + 1 + 1 + 32 + 6);
      expect(verifyBech32(address, hrp)).toBe(true);
    }
  });

  it('never repeats addresses', async () => {
    const addresses = await Promise.all(Array.from({ length: 50 }, () => generator.generate('testnet')));
    expect(new Set(addresses).size).toBe(50);
  });
});

describe('TransactionHistoryHttpClient', () => {
  const fetchMock = jest.fn();
  const originalFetch = global.fetch;
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterAll(() => {
    global.fetch = originalFetch;
  });

  const client = new TransactionHistoryHttpClient({ baseUrl: 'http://tx:3002' });
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

  it('queries by walletId (URL-encoded), forwards the bearer token and bounds the call with a timeout', async () => {
    fetchMock.mockResolvedValue(ok({ items: [{ id: 't1' }], total: 1 }));
    const items = await client.getHistoryForWallet('w/1?x', 'Bearer user-token');
    expect(items).toEqual([{ id: 't1' }]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://tx:3002/api/v1/transactions?walletId=w%2F1%3Fx');
    expect(init.headers).toEqual({ authorization: 'Bearer user-token' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('sends no headers without an authorization value', async () => {
    fetchMock.mockResolvedValue(ok({ items: [] }));
    await client.getHistoryForWallet('w1');
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].headers).toBeUndefined();
  });

  it.each([401, 404, 500, 503])('throws on upstream %d', async (status) => {
    fetchMock.mockResolvedValue(new Response('{}', { status }));
    await expect(client.getHistoryForWallet('w1')).rejects.toThrow(`transaction-service responded with ${status}`);
  });

  it('propagates network/timeout failures', async () => {
    fetchMock.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'TimeoutError' }));
    await expect(client.getHistoryForWallet('w1')).rejects.toThrow('aborted');
  });
});
