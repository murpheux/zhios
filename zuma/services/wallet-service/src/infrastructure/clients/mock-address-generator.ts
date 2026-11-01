import { randomBytes } from 'node:crypto';
import type { AddressGeneratorPort } from '../../application/ports/address-generator.port';
import type { WalletNetwork } from '../../domain/value-objects/network';

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GENERATORS = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
const HRP: Record<WalletNetwork, string> = { mainnet: 'bc', testnet: 'tb', regtest: 'bcrt' };

const polymod = (values: number[]): number => {
  let chk = 1;
  for (const value of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ value;
    GENERATORS.forEach((gen, i) => {
      if ((top >>> i) & 1) chk ^= gen;
    });
  }
  return chk >>> 0;
};

const hrpExpand = (hrp: string): number[] => [
  ...[...hrp].map((c) => c.charCodeAt(0) >> 5),
  0,
  ...[...hrp].map((c) => c.charCodeAt(0) & 31),
];

const toWords = (bytes: Uint8Array): number[] => {
  const words: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const byte of bytes) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      words.push((acc >> bits) & 31);
    }
  }
  if (bits > 0) words.push((acc << (5 - bits)) & 31);
  return words;
};

// Witness v0 => bech32 (BIP-173) checksum constant 1.
const encodeP2wpkh = (hrp: string, program: Uint8Array): string => {
  const data = [0, ...toWords(program)];
  const mod = polymod([...hrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0]) ^ 1;
  const checksum = Array.from({ length: 6 }, (_, i) => (mod >>> (5 * (5 - i))) & 31);
  return `${hrp}1${[...data, ...checksum].map((w) => CHARSET[w]).join('')}`;
};

// MOCK address generator for local/test use only: emits a checksum-valid P2WPKH address over a random
// 20-byte program (no key behind it — funds sent there are unspendable).
// Production must derive addresses from an HD wallet seed held in an HSM/KMS, never in-process.
export class MockAddressGenerator implements AddressGeneratorPort {
  async generate(network: WalletNetwork): Promise<string> {
    return encodeP2wpkh(HRP[network], randomBytes(20));
  }
}
