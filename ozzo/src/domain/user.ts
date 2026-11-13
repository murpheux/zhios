import {
  normalizeEmail,
  normalizeName,
  normalizeUsername,
} from './value-objects';
import { ValidationError } from './errors';

export interface User {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  /** Okta user id (JWT `sub`). */
  externalId: string;
  createdAt: Date;
  updatedAt: Date;
}

export type NewUser = Omit<User, 'id' | 'createdAt' | 'updatedAt'>;
export type UserPatch = Partial<Pick<User, 'username' | 'email' | 'firstName' | 'lastName'>>;

export interface NewUserInput {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  externalId: string;
}

export function buildNewUser(input: NewUserInput): NewUser {
  if (input.externalId.trim().length === 0) {
    throw new ValidationError('externalId is required');
  }
  return {
    username: normalizeUsername(input.username),
    email: normalizeEmail(input.email),
    firstName: normalizeName(input.firstName, 'firstName'),
    lastName: normalizeName(input.lastName, 'lastName'),
    externalId: input.externalId.trim(),
  };
}

export function buildUserPatch(input: UserPatch): UserPatch {
  const patch: UserPatch = {};
  if (input.username !== undefined) patch.username = normalizeUsername(input.username);
  if (input.email !== undefined) patch.email = normalizeEmail(input.email);
  if (input.firstName !== undefined) patch.firstName = normalizeName(input.firstName, 'firstName');
  if (input.lastName !== undefined) patch.lastName = normalizeName(input.lastName, 'lastName');
  if (Object.keys(patch).length === 0) {
    throw new ValidationError('At least one field must be provided');
  }
  return patch;
}
