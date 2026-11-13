import { buildAddress, type Address, type AddressInput } from './address';
import {
  assertSex,
  normalizeDateOfBirth,
  normalizeEmail,
  normalizeName,
  normalizePhone,
  normalizeUsername,
  type Sex,
} from './value-objects';
import { ValidationError } from './errors';

export interface NextOfKin {
  fullName: string;
  relationship: string;
  phone?: string;
  email?: string;
}

export interface ContactPerson {
  fullName: string;
  phone: string;
  email?: string;
}

export interface NextOfKinInput {
  fullName: string;
  relationship: string;
  phone?: string;
  email?: string;
}

export interface ContactPersonInput {
  fullName: string;
  phone: string;
  email?: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  /** Okta user id (JWT `sub`). */
  externalId: string;
  address: Address | null;
  dateOfBirth: Date | null;
  nextOfKin: NextOfKin | null;
  contactPerson: ContactPerson | null;
  sex: Sex | null;
  /** SIN/SSN ciphertext from SensitiveDataPort; the plaintext is never stored or returned. */
  encryptedTaxId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NewUser = Omit<User, 'id' | 'createdAt' | 'updatedAt'>;
export type UserPatch = Partial<
  Pick<
    User,
    | 'username'
    | 'email'
    | 'firstName'
    | 'lastName'
    | 'address'
    | 'dateOfBirth'
    | 'nextOfKin'
    | 'contactPerson'
    | 'sex'
    | 'encryptedTaxId'
  >
>;

/** Raw (un-normalized) profile fields shared by create and update. */
export interface ProfileInput {
  address?: AddressInput;
  dateOfBirth?: string;
  nextOfKin?: NextOfKinInput;
  contactPerson?: ContactPersonInput;
  sex?: string;
  /** Already encrypted via SensitiveDataPort. */
  encryptedTaxId?: string;
}

export interface NewUserInput extends ProfileInput {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  externalId: string;
}

export interface UserPatchInput extends ProfileInput {
  username?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
}

function buildNextOfKin(input: NextOfKinInput): NextOfKin {
  const kin: NextOfKin = {
    fullName: normalizeName(input.fullName, 'nextOfKin.fullName'),
    relationship: normalizeName(input.relationship, 'nextOfKin.relationship'),
  };
  if (input.phone !== undefined) kin.phone = normalizePhone(input.phone, 'nextOfKin.phone');
  if (input.email !== undefined) kin.email = normalizeEmail(input.email);
  return kin;
}

function buildContactPerson(input: ContactPersonInput): ContactPerson {
  const contact: ContactPerson = {
    fullName: normalizeName(input.fullName, 'contactPerson.fullName'),
    phone: normalizePhone(input.phone, 'contactPerson.phone'),
  };
  if (input.email !== undefined) contact.email = normalizeEmail(input.email);
  return contact;
}

/** Only fields present in the input appear in the result (so it can back a partial update). */
function buildProfilePatch(input: ProfileInput): UserPatch {
  const patch: UserPatch = {};
  if (input.address !== undefined) patch.address = buildAddress(input.address);
  if (input.dateOfBirth !== undefined) patch.dateOfBirth = normalizeDateOfBirth(input.dateOfBirth);
  if (input.nextOfKin !== undefined) patch.nextOfKin = buildNextOfKin(input.nextOfKin);
  if (input.contactPerson !== undefined) patch.contactPerson = buildContactPerson(input.contactPerson);
  if (input.sex !== undefined) patch.sex = assertSex(input.sex);
  if (input.encryptedTaxId !== undefined) patch.encryptedTaxId = input.encryptedTaxId;
  return patch;
}

export function buildNewUser(input: NewUserInput): NewUser {
  if (input.externalId.trim().length === 0) {
    throw new ValidationError('externalId is required');
  }
  const profile = buildProfilePatch(input);
  return {
    username: normalizeUsername(input.username),
    email: normalizeEmail(input.email),
    firstName: normalizeName(input.firstName, 'firstName'),
    lastName: normalizeName(input.lastName, 'lastName'),
    externalId: input.externalId.trim(),
    address: profile.address ?? null,
    dateOfBirth: profile.dateOfBirth ?? null,
    nextOfKin: profile.nextOfKin ?? null,
    contactPerson: profile.contactPerson ?? null,
    sex: profile.sex ?? null,
    encryptedTaxId: profile.encryptedTaxId ?? null,
  };
}

export function buildUserPatch(input: UserPatchInput): UserPatch {
  const patch: UserPatch = buildProfilePatch(input);
  if (input.username !== undefined) patch.username = normalizeUsername(input.username);
  if (input.email !== undefined) patch.email = normalizeEmail(input.email);
  if (input.firstName !== undefined) patch.firstName = normalizeName(input.firstName, 'firstName');
  if (input.lastName !== undefined) patch.lastName = normalizeName(input.lastName, 'lastName');
  if (Object.keys(patch).length === 0) {
    throw new ValidationError('At least one field must be provided');
  }
  return patch;
}
