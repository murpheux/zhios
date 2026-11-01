import { canBeDebited, createWalletEntity } from '../src/domain/entities/wallet.entity';
import {
  MAX_SUPPLY_SATS,
  formatSats,
  isValidSatsAmount,
  isValidSatsBalance,
  parseSatsAmount,
} from '../src/domain/value-objects/satoshi';
import { toWalletResponse } from '../src/api/routes/wallet.presenter';
import { buildWallet } from './helpers';

describe('satoshi value object', () => {
  it.each<[string, number | null]>([
    ['1', 1],
    ['100000', 100000],
    ['2100000000000000', MAX_SUPPLY_SATS],
    ['2100000000000001', null],
    ['9999999999999999', null],
    ['0', null],
    ['01', null],
    ['-1', null],
    ['1.0', null],
    ['1e3', null],
    [' 1', null],
    ['', null],
    ['12345678901234567', null],
  ])('parseSatsAmount(%p) -> %p', (value, expected) => {
    expect(parseSatsAmount(value)).toBe(expected);
  });

  it.each<[number, boolean, boolean]>([
    [0, false, true],
    [1, true, true],
    [MAX_SUPPLY_SATS, true, true],
    [MAX_SUPPLY_SATS + 1, false, false],
    [-1, false, false],
    [1.5, false, false],
    [Number.NaN, false, false],
    [Number.POSITIVE_INFINITY, false, false],
  ])('%p: amount=%p balance=%p', (value, amount, balance) => {
    expect(isValidSatsAmount(value)).toBe(amount);
    expect(isValidSatsBalance(value)).toBe(balance);
  });

  it.each<[number, string]>([
    [0, '0'],
    [42, '42'],
    [MAX_SUPPLY_SATS, '2100000000000000'],
  ])('formatSats(%p) -> %p (no exponent)', (value, expected) => {
    expect(formatSats(value)).toBe(expected);
  });
});

describe('wallet entity', () => {
  it('creates an active, zero-balance wallet with empty metadata by default', () => {
    expect(
      createWalletEntity({ label: 'L', address: 'tb1q', network: 'testnet', type: 'cold', ownerUserId: 'u1' }),
    ).toEqual({
      label: 'L',
      address: 'tb1q',
      network: 'testnet',
      type: 'cold',
      ownerUserId: 'u1',
      balanceSats: 0,
      metadata: {},
      status: 'active',
    });
  });

  it('keeps provided metadata', () => {
    const draft = createWalletEntity({
      label: 'L',
      address: 'a',
      network: 'mainnet',
      type: 'hot',
      ownerUserId: 'u',
      metadata: { purpose: 'savings' },
    });
    expect(draft.metadata).toEqual({ purpose: 'savings' });
  });

  it.each<['active' | 'suspended' | 'archived', boolean]>([
    ['active', true],
    ['suspended', false],
    ['archived', false],
  ])('canBeDebited(%s) -> %p', (status, expected) => {
    expect(canBeDebited({ status })).toBe(expected);
  });
});

describe('toWalletResponse', () => {
  it('replaces integer balanceSats with the balanceCache sats string', () => {
    const response = toWalletResponse(buildWallet({ balanceSats: 150000 }));
    expect(response.balanceCache).toBe('150000');
    expect(response).not.toHaveProperty('balanceSats');
  });
});
