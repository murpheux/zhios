/** Extra authenticated context bound to the ciphertext (maps to KMS EncryptionContext). */
export type SensitiveDataContext = Record<string, string>;

/**
 * Envelope for field-level encryption of regulated identifiers (SIN/SSN).
 * Plaintext must never be persisted, cached or logged; only ciphertext leaves this port's callers.
 */
export interface SensitiveDataPort {
  /** Returns an opaque, storable ciphertext string. */
  encrypt(plaintext: string, context?: SensitiveDataContext): Promise<string>;
  /** Throws if the ciphertext is malformed, tampered with, or the context does not match. */
  decrypt(ciphertext: string, context?: SensitiveDataContext): Promise<string>;
}
