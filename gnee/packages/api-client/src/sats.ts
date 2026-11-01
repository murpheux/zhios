/**
 * Integer-satoshi helpers. zuma transmits every amount/balance as a string of
 * integer satoshis; these helpers never go through a JS `number`, so there is
 * no floating-point rounding anywhere between user input and the wire.
 */

export const SATS_PER_BTC = 100_000_000n;
/** 21,000,000 BTC — an upper bound for any sane amount. */
export const MAX_SUPPLY_SATS = 21_000_000n * SATS_PER_BTC;
export const BTC_DECIMALS = 8;

const SATS_PATTERN = /^(?:0|[1-9][0-9]*)$/;
const SATS_INPUT_PATTERN = /^[0-9]+$/;
const BTC_INPUT_PATTERN = /^([0-9]*)(?:\.([0-9]*))?$/;

/** True for a canonical non-negative integer-satoshi string within the 21M BTC supply ("0", "150000"). */
export function isSatsString(value: string): boolean {
  return SATS_PATTERN.test(value) && BigInt(value) <= MAX_SUPPLY_SATS;
}

/** Parses a canonical integer-satoshi string into a bigint; throws on anything else. */
export function parseSats(value: string): bigint {
  if (!isSatsString(value)) {
    throw new RangeError(`Not an integer-satoshi string: ${JSON.stringify(value)}`);
  }
  return BigInt(value);
}

/** Formats satoshis as a BTC decimal string with exactly 8 decimals ("150000" -> "0.00150000"). */
export function satsToBtc(sats: string | bigint): string {
  const value = typeof sats === "bigint" ? sats : parseSats(sats);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / SATS_PER_BTC;
  const fraction = (abs % SATS_PER_BTC).toString().padStart(BTC_DECIMALS, "0");
  return `${negative ? "-" : ""}${whole.toString()}.${fraction}`;
}

/** Display helper: "0.00150000 BTC". Falls back to "—" for a malformed server value rather than throwing during render. */
export function formatBtc(sats: string | bigint): string {
  try {
    return `${satsToBtc(sats)} BTC`;
  } catch {
    return "—";
  }
}

/** Display helper with thousands separators: "150,000 sats". */
export function formatSats(sats: string | bigint): string {
  try {
    const value = typeof sats === "bigint" ? sats : parseSats(sats);
    return `${value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")} sats`;
  } catch {
    return "—";
  }
}

/**
 * Parses user-entered BTC ("0.0015", "1", ".5", "21000000") into an integer-satoshi
 * string. Returns null for anything that isn't a plain non-negative decimal with
 * at most 8 fractional digits within the 21M supply: exponents ("1e-8"), signs,
 * separators, sub-satoshi precision ("0.000000001") and non-numeric input are all
 * rejected. Surrounding whitespace is ignored.
 */
export function parseBtcInputToSats(input: string): string | null {
  const match = BTC_INPUT_PATTERN.exec(input.trim());
  if (!match) return null;
  const whole = match[1] ?? "";
  const fraction = match[2] ?? "";
  if (whole === "" && fraction === "") return null;
  if (fraction.length > BTC_DECIMALS) return null;
  const sats = BigInt(whole || "0") * SATS_PER_BTC + BigInt(fraction.padEnd(BTC_DECIMALS, "0"));
  return sats <= MAX_SUPPLY_SATS ? sats.toString() : null;
}

/** Parses user-entered satoshis ("15000", " 0015000 ") into a canonical string, or null. */
export function parseSatsInput(input: string): string | null {
  const trimmed = input.trim();
  if (!SATS_INPUT_PATTERN.test(trimmed)) return null;
  const sats = BigInt(trimmed);
  return sats <= MAX_SUPPLY_SATS ? sats.toString() : null;
}

export type AmountUnit = "BTC" | "SATS";

/** Parses an amount typed in the given unit into integer sats, or null if invalid. */
export function parseAmountInput(input: string, unit: AmountUnit): string | null {
  return unit === "BTC" ? parseBtcInputToSats(input) : parseSatsInput(input);
}

/** Re-expresses an amount when the user flips the unit toggle; leaves invalid/partial input untouched. */
export function convertAmountInput(input: string, from: AmountUnit, to: AmountUnit): string {
  if (from === to) return input;
  const sats = parseAmountInput(input, from);
  if (sats === null) return input;
  if (to === "SATS") return sats;
  // Trim trailing zeros for editing ("0.00150000" -> "0.0015").
  return satsToBtc(sats).replace(/\.?0+$/, "");
}
