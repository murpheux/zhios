import { ForbiddenError, type User } from '../domain';

export interface Actor {
  /** Okta user id from the verified JWT. */
  sub: string;
  isAdmin: boolean;
  /** Raw bearer token, only used to forward to zuma. */
  token?: string;
}

export function assertCanAccess(owner: { externalId: string }, actor: Actor): void {
  if (!actor.isAdmin && owner.externalId !== actor.sub) {
    throw new ForbiddenError();
  }
}

export type OwnedUser = Pick<User, 'externalId'>;
