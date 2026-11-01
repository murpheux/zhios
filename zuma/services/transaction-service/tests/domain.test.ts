import { isValidAddressForNetwork } from '../src/domain/value-objects/bitcoin-address';
import { MAX_SUPPLY_SATS, formatSats, isValidSatsAmount, parseFeeRate, parseSatsAmount } from '../src/domain/value-objects/satoshi';
import { totalDebitSats } from '../src/domain/entities/transaction.entity';
import { createAuditLogEntity } from '../src/domain/entities/audit-log.entity';
import { createSystemEventEntity } from '../src/domain/entities/system-event.entity';
import type { BitcoinNetwork } from '../src/domain/value-objects/transaction-status';

describe('isValidAddressForNetwork (BIP-173 / BIP-350 edge vectors)', () => {
  it.each<[string, string, BitcoinNetwork, boolean]>([
    ['v0 P2WSH mainnet', 'bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3', 'mainnet', true],
    ['v0 regtest', 'bcrt1q6rhpng9evdsfnn833a4f4vej0asu6dk5srld6x', 'regtest', true],
    ['v16 (2-byte program, bech32m)', 'BC1SW50QGDZ25J', 'mainnet', true],
    ['v2 (16-byte program, bech32m)', 'bc1zw508d6qejxtdg4y5r3zarvaryvaxxpcs', 'mainnet', true],
    ['v1 with a 40-byte program (rejected: taproot is 32)', 'bc1pw508d6qejxtdg4y5r3zarvary0c5xw7kw508d6qejxtdg4y5r3zarvary0c5xw7kt5nd6y', 'mainnet', false],
    ['v0 with a 16-byte program', 'BC1QR508D6QEJXTDG4Y5R3ZARVARYV98GJ9P', 'mainnet', false],
    ['witness version 17', 'BC13W508D6QEJXTDG4Y5R3ZARVARY0C5XW7KN40WF2', 'mainnet', false],
    ['program too short', 'bc1rw5uspcuh', 'mainnet', false],
    ['program too long (41 bytes)', 'bc10w508d6qejxtdg4y5r3zarvary0c5xw7kw508d6qejxtdg4y5r3zarvary0c5xw7kw5rljs90', 'mainnet', false],
    ['non-zero padding', 'tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3pjxtptv', 'testnet', false],
    ['more than 4 padding bits', 'bc1zw508d6qejxtdg4y5r3zarvaryvqyzf3du', 'mainnet', false],
    ['v0 using the bech32m constant', 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kemeawh', 'mainnet', false],
    ['v1 using the bech32 constant', 'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vpggkg4j', 'mainnet', false],
    ['character outside the charset', 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3tb', 'mainnet', false],
    ['empty data part', 'bc1gmk9yu', 'mainnet', false],
    ['no separator', 'bcqw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', 'mainnet', false],
    ['empty hrp', '1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', 'mainnet', false],
    ['over 90 characters', `bc1q${'q'.repeat(87)}`, 'mainnet', false],
    ['unknown hrp', 'tc1qw508d6qejxtdg4y5r3zarvary0c5xw7kg3g4ty', 'testnet', false],
    ['regtest hrp on testnet', 'bcrt1q6rhpng9evdsfnn833a4f4vej0asu6dk5srld6x', 'testnet', false],
    ['testnet P2SH base58', '2MzQwSSnBHWHqSAqtTVQ6v47XtaisrJa1Vc', 'testnet', true],
    ['testnet n-prefix P2PKH', 'n3GNqMveyvaPvUbH469vDRadqpJMPc84JA', 'regtest', true],
    ['base58 with forbidden 0/O/I/l', '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNV0l', 'mainnet', false],
  ])('%s: %s on %s -> %p', (_name, address, network, expected) => {
    expect(isValidAddressForNetwork(address, network)).toBe(expected);
  });
});

describe('satoshi value object', () => {
  it.each<[string, number | null]>([
    ['1', 1],
    ['2100000000000000', MAX_SUPPLY_SATS],
    ['2100000000000001', null],
    ['0', null],
    ['1.5', null],
    ['-1', null],
    ['007', null],
  ])('parseSatsAmount(%p) -> %p', (value, expected) => {
    expect(parseSatsAmount(value)).toBe(expected);
  });

  it.each<[string, number | null]>([
    ['1', 1],
    ['12', 12],
    ['10000', 10000],
    ['10001', null],
    ['99999', null],
    ['100000', null],
    ['0', null],
    ['01', null],
    ['1.5', null],
    ['-1', null],
    ['', null],
  ])('parseFeeRate(%p) -> %p', (value, expected) => {
    expect(parseFeeRate(value)).toBe(expected);
  });

  it.each<[number, boolean]>([
    [1, true],
    [0, false],
    [MAX_SUPPLY_SATS + 1, false],
    [0.5, false],
  ])('isValidSatsAmount(%p) -> %p', (value, expected) => {
    expect(isValidSatsAmount(value)).toBe(expected);
  });

  it('formats without exponent notation', () => {
    expect(formatSats(MAX_SUPPLY_SATS)).toBe('2100000000000000');
  });
});

describe('entities', () => {
  it.each<[string, string, number]>([
    ['100000', '1692', 101692],
    ['1', '0', 1],
    ['2100000000000000', '1410000', 2100000001410000],
  ])('totalDebitSats(%s + %s) = %d', (amount, feeSats, total) => {
    expect(totalDebitSats({ amount, feeSats })).toBe(total);
  });

  it('creates audit log drafts with default metadata', () => {
    expect(createAuditLogEntity({ actorUserId: 'u', action: 'a', entityType: 'T', entityId: '1' })).toEqual({
      actorUserId: 'u',
      action: 'a',
      entityType: 'T',
      entityId: '1',
      metadata: {},
    });
    expect(
      createAuditLogEntity({ actorUserId: 'u', action: 'a', entityType: 'T', entityId: '1', metadata: { x: 1 } }).metadata,
    ).toEqual({ x: 1 });
  });

  it('creates system event drafts', () => {
    expect(createSystemEventEntity({ eventType: 'e', payload: { id: 1 } })).toEqual({ eventType: 'e', payload: { id: 1 } });
  });
});
