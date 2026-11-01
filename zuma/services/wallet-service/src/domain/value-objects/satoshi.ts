// Money is always integer satoshis. Number is exact here: max supply (2.1e15) < Number.MAX_SAFE_INTEGER (~9.007e15).
export const MAX_SUPPLY_SATS = 2_100_000_000_000_000;

const SATS_DIGITS = /^[1-9][0-9]{0,15}$/;

export const isValidSatsAmount = (value: number): boolean =>
  Number.isSafeInteger(value) && value > 0 && value <= MAX_SUPPLY_SATS;

export const isValidSatsBalance = (value: number): boolean =>
  Number.isSafeInteger(value) && value >= 0 && value <= MAX_SUPPLY_SATS;

// Parses a positive satoshi amount from its decimal-string wire form; null when malformed or out of range.
export const parseSatsAmount = (value: string): number | null => {
  if (!SATS_DIGITS.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return isValidSatsAmount(parsed) ? parsed : null;
};

// Safe integers below 1e21 always stringify as plain digits (no exponent), so this round-trips exactly.
export const formatSats = (value: number): string => String(value);
