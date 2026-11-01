import type { BitcoinNetwork } from './transaction-status';

// Network-aware destination address validation (pure, no deps):
//  - bech32 (witness v0, BIP-173) / bech32m (v1+, BIP-350): FULL checksum, HRP, witness version and
//    program-length verification.
//  - base58 (P2PKH/P2SH legacy): shape + network version-prefix check only — the base58check double-SHA256
//    checksum is NOT verified here (the node's build step rejects bad legacy checksums).

const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const BECH32_CONST = 1;
const BECH32M_CONST = 0x2bc830a3;
const GENERATORS = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

const HRP_BY_NETWORK: Record<BitcoinNetwork, string> = { mainnet: 'bc', testnet: 'tb', regtest: 'bcrt' };

// Mainnet legacy: P2PKH '1', P2SH '3'. Testnet/regtest legacy: P2PKH 'm'/'n', P2SH '2'.
const BASE58_BY_NETWORK: Record<BitcoinNetwork, RegExp> = {
  mainnet: /^[13][1-9A-HJ-NP-Za-km-z]{25,34}$/,
  testnet: /^[mn2][1-9A-HJ-NP-Za-km-z]{25,34}$/,
  regtest: /^[mn2][1-9A-HJ-NP-Za-km-z]{25,34}$/,
};

const polymod = (values: number[]): number => {
  let chk = 1;
  for (const value of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ value;
    for (let i = 0; i < 5; i += 1) {
      if ((top >>> i) & 1) {
        chk ^= GENERATORS[i] as number;
      }
    }
  }
  return chk >>> 0;
};

const hrpExpand = (hrp: string): number[] => {
  const codes = [...hrp].map((c) => c.charCodeAt(0));
  return [...codes.map((c) => c >> 5), 0, ...codes.map((c) => c & 31)];
};

// 5-bit words -> bytes, strict (no leftover non-zero padding), per BIP-173.
const fromWords = (words: number[]): number[] | null => {
  let acc = 0;
  let bits = 0;
  const out: number[] = [];
  for (const word of words) {
    acc = (acc << 5) | word;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 0xff);
    }
  }
  if (bits >= 5 || ((acc << (8 - bits)) & 0xff) !== 0) {
    return null;
  }
  return out;
};

const isValidSegwitAddress = (address: string, expectedHrp: string): boolean => {
  // Mixed case is invalid; all-upper (QR form) is allowed.
  if (address !== address.toLowerCase() && address !== address.toUpperCase()) {
    return false;
  }
  const lower = address.toLowerCase();
  if (lower.length > 90) {
    return false;
  }
  const sep = lower.lastIndexOf('1');
  if (sep < 1 || lower.length - sep - 1 < 6) {
    return false;
  }
  const hrp = lower.slice(0, sep);
  if (hrp !== expectedHrp) {
    return false;
  }
  const data: number[] = [];
  for (const char of lower.slice(sep + 1)) {
    const value = BECH32_CHARSET.indexOf(char);
    if (value === -1) {
      return false;
    }
    data.push(value);
  }
  const witnessVersion = data[0];
  if (witnessVersion === undefined || witnessVersion > 16) {
    return false;
  }
  const checksum = polymod([...hrpExpand(hrp), ...data]);
  const expectedConst = witnessVersion === 0 ? BECH32_CONST : BECH32M_CONST;
  if (checksum !== expectedConst) {
    return false;
  }
  const program = fromWords(data.slice(1, -6));
  if (!program || program.length < 2 || program.length > 40) {
    return false;
  }
  // v0 programs are exactly P2WPKH (20) or P2WSH (32); v1 (taproot) is 32.
  if (witnessVersion === 0 && program.length !== 20 && program.length !== 32) {
    return false;
  }
  if (witnessVersion === 1 && program.length !== 32) {
    return false;
  }
  return true;
};

export const isValidAddressForNetwork = (address: string, network: BitcoinNetwork): boolean => {
  if (BASE58_BY_NETWORK[network].test(address)) {
    return true;
  }
  return isValidSegwitAddress(address, HRP_BY_NETWORK[network]);
};

// Coarse, network-agnostic shape used in the JSON schema (the network-specific check needs the wallet).
export const BITCOIN_ADDRESS_SHAPE_PATTERN =
  '^(?:[13mn2][1-9A-HJ-NP-Za-km-z]{25,34}|(?:bc|tb|bcrt|BC|TB|BCRT)1[02-9ac-hj-np-zAC-HJ-NP-Z]{6,87})$';
