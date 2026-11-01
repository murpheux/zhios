import {
  OBJECT_ID_PATTERN,
  SATS_AMOUNT_PATTERN,
  SATS_BALANCE_PATTERN,
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
  isPrivileged,
  toPaginatedResult,
} from '../src';

describe('isPrivileged', () => {
  it.each<[string[], boolean]>([
    [[], false],
    [['user'], false],
    [['service'], false],
    [['admin'], true],
    [['auditor'], true],
    [['user', 'auditor'], true],
  ])('roles %j -> %p', (roles, expected) => {
    expect(isPrivileged({ sub: 'u', roles })).toBe(expected);
  });
});

describe('toPaginatedResult', () => {
  it.each<[number, number, number]>([
    [0, 20, 1],
    [1, 20, 1],
    [20, 20, 1],
    [21, 20, 2],
    [101, 10, 11],
  ])('total=%d limit=%d -> totalPages=%d', (total, limit, totalPages) => {
    expect(toPaginatedResult(['a'], total, { page: 2, limit })).toEqual({
      items: ['a'],
      total,
      page: 2,
      limit,
      totalPages,
    });
  });
});

describe('wire patterns', () => {
  const amount = new RegExp(SATS_AMOUNT_PATTERN);
  const balance = new RegExp(SATS_BALANCE_PATTERN);
  const objectId = new RegExp(OBJECT_ID_PATTERN);

  it.each<[string, boolean, boolean]>([
    ['0', false, true],
    ['1', true, true],
    ['100000', true, true],
    ['2100000000000000', true, true],
    ['12345678901234567', false, false],
    ['01', false, false],
    ['-1', false, false],
    ['1.5', false, false],
    ['1e3', false, false],
    ['', false, false],
  ])('%p amount=%p balance=%p', (value, isAmount, isBalance) => {
    expect(amount.test(value)).toBe(isAmount);
    expect(balance.test(value)).toBe(isBalance);
  });

  it.each<[string, boolean]>([
    ['6710f1f1c2a1b2c3d4e5f6a7', true],
    ['6710F1F1C2A1B2C3D4E5F6A7', false],
    ['6710f1f1c2a1b2c3d4e5f6a', false],
    ['not-an-id', false],
  ])('ObjectId %p -> %p', (value, expected) => {
    expect(objectId.test(value)).toBe(expected);
  });

  it('exposes the transaction enums', () => {
    expect(TRANSACTION_TYPES).toEqual(['send', 'receive', 'internal-transfer']);
    expect(TRANSACTION_STATUSES).toEqual(['pending', 'broadcasting', 'broadcast', 'confirmed', 'failed']);
  });
});
