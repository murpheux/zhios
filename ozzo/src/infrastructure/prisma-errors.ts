import { ConflictError } from '../domain';

const hasCode = (err: unknown, code: string): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: unknown }).code === code;

export const isUniqueViolation = (err: unknown): boolean => hasCode(err, 'P2002');
export const isRecordNotFound = (err: unknown): boolean => hasCode(err, 'P2025');

/** Maps a Prisma P2002 to a ConflictError naming the offending field(s); otherwise rethrows. */
export function rethrowUniqueViolation(err: unknown, resource: string): never {
  if (isUniqueViolation(err)) {
    const target = (err as { meta?: { target?: unknown } }).meta?.target;
    const fields = Array.isArray(target) ? target.join(', ') : String(target ?? 'unique field');
    throw new ConflictError(`${resource} already exists (${fields})`);
  }
  throw err;
}
