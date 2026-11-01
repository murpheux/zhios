// Money is always integer satoshis. Number is exact here: max supply (2.1e15) < Number.MAX_SAFE_INTEGER.
export const MAX_SUPPLY_SATS = 2_100_000_000_000_000;
export const MIN_FEE_RATE_SAT_PER_VB = 1;
export const MAX_FEE_RATE_SAT_PER_VB = 10_000;

const SATS_DIGITS = /^[1-9][0-9]{0,15}$/;
const FEE_RATE_DIGITS = /^[1-9][0-9]{0,4}$/;

export const isValidSatsAmount = (value: number): boolean =>
  Number.isSafeInteger(value) && value > 0 && value <= MAX_SUPPLY_SATS;

// Parses a positive satoshi amount from its decimal-string wire form; null when malformed or out of range.
export const parseSatsAmount = (value: string): number | null => {
  if (!SATS_DIGITS.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return isValidSatsAmount(parsed) ? parsed : null;
};

// Fee rate in sat/vB, a bounded positive integer.
export const parseFeeRate = (value: string): number | null => {
  if (!FEE_RATE_DIGITS.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return parsed >= MIN_FEE_RATE_SAT_PER_VB && parsed <= MAX_FEE_RATE_SAT_PER_VB ? parsed : null;
};

export const formatSats = (value: number): string => String(value);
