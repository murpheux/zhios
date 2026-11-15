// MongoDB duplicate-key error (E11000), raised when a unique index rejects an insert/update.
export const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000;
