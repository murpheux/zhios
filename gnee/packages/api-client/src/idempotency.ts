/** Minimal subset of the Web Crypto API this module needs. */
export interface RandomSource {
  randomUUID?: () => string;
  getRandomValues?(array: Uint8Array): unknown;
}

/**
 * Returns a v4 UUID for `CreateTransactionInput.idempotencyKey` (matches the
 * gateway's `^[A-Za-z0-9_-]{8,128}$`). Uses `crypto.randomUUID` when present,
 * else builds one from `crypto.getRandomValues`. Never falls back to
 * Math.random — throws instead, so a predictable key is never sent.
 *
 * React Native/Hermes has no global `crypto` by default: either polyfill it
 * (e.g. `react-native-get-random-values`) or pass a source such as expo-crypto.
 */
export function createIdempotencyKey(source: RandomSource | undefined = globalThis.crypto): string {
  if (typeof source?.randomUUID === "function") {
    return source.randomUUID();
  }
  if (typeof source?.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    source.getRandomValues(bytes);
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40; // version 4
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // RFC 4122 variant
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  throw new Error("No cryptographically secure random source available to create an idempotency key");
}
