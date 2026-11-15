// The authenticated caller, derived from a verified JWT; passed into every use-case for authorization.
export interface Actor {
  sub: string;
  roles: string[];
}

const PRIVILEGED_ROLES = ['admin', 'auditor'];

// Privileged actors bypass per-resource ownership checks on reads; writes still enforce ownership.
export const isPrivileged = (actor: Actor): boolean =>
  actor.roles.some((role) => PRIVILEGED_ROLES.includes(role));
