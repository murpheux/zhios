import { isValidAddressForNetwork, BITCOIN_ADDRESS_SHAPE_PATTERN } from '../src/domain/value-objects/bitcoin-address';
import type { BitcoinNetwork } from '../src/domain/value-objects/transaction-status';

describe('isValidAddressForNetwork', () => {
  it.each<[string, BitcoinNetwork, boolean]>([
    ['bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', 'mainnet', true],
    ['BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4', 'mainnet', true],
    ['bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5', 'mainnet', false], // bad checksum
    ['bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', 'testnet', false], // wrong network
    ['Bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', 'mainnet', false], // mixed case
    ['bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0', 'mainnet', true], // taproot bech32m
    ['tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7', 'testnet', true],
    ['tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7', 'regtest', false],
    ['tb1pqqqqp399et2xygdj5xreqhjjvcmzhxw4aywxecjdzew6hylgvsesf3hn0c', 'testnet', true],
    ['1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2', 'mainnet', true], // base58 shape
    ['3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy', 'mainnet', true],
    ['mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn', 'testnet', true],
    ['mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn', 'mainnet', false],
    ['1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2', 'testnet', false],
    ['tb1qdestinationaddressexample', 'testnet', false],
    ['', 'testnet', false],
  ])('%s on %s -> %s', (address, network, expected) => {
    expect(isValidAddressForNetwork(address, network)).toBe(expected);
  });

  it('coarse JSON-schema shape accepts valid examples and rejects junk', () => {
    const shape = new RegExp(BITCOIN_ADDRESS_SHAPE_PATTERN);
    expect(shape.test('tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7')).toBe(true);
    expect(shape.test('mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn')).toBe(true);
    expect(shape.test('not an address')).toBe(false);
    expect(shape.test('tb1q...')).toBe(false);
  });
});
