import type { NewUser, User, UserPatch } from '../../domain';

export interface UserRepository {
  /** Throws ConflictError on duplicate username/email/externalId. */
  create(user: NewUser): Promise<User>;
  findById(id: string): Promise<User | null>;
  findByExternalId(externalId: string): Promise<User | null>;
  /** Throws NotFoundError if missing, ConflictError on duplicate username/email. */
  update(id: string, patch: UserPatch): Promise<User>;
}
