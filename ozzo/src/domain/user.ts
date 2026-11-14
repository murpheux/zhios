import { buildAddress, type Address, type AddressInput } from './address';
import {
  normalizeEmail,
  normalizeName,
  normalizeUsername,
  normalizeDateOfBirth,
} from './value-objects';
import { ValidationError } from './errors';
import { assertRole, assertPermission, type Role, type Permission } from './enums';
import {
  buildUserContact,
  buildUserIdentity,
  buildUserPreferences,
  buildUserEmergencyContacts,
  type UserContact,
  type UserIdentity,
  type UserPreferences,
  type UserEmergencyContacts,
  type UserContactInput,
  type UserIdentityInput,
  type UserPreferencesInput,
  type UserEmergencyContactsInput,
} from './user-profile';
import {
  buildUserEmployment,
  buildUserCompliance,
  buildExternalIds,
  buildUserAudit,
  type UserEmployment,
  type UserCompliance,
  type ExternalIds,
  type UserAudit,
  type UserEmploymentInput,
  type UserComplianceInput,
  type ExternalIdsInput,
} from './user-compliance';

/**
 * Core User entity — focused on identity and authentication.
 *
 * Related entities:
 * - UserProfile (Identity, Contact, Preferences, EmergencyContacts)
 * - UserCompliance (Tax ID, consents, employment)
 * - UserAudit (Audit trail and lifecycle)
 */
export interface User {
  // ---- Identity & Authentication
  id: string;
  username: string;
  email: string;
  /** Okta user ID (JWT `sub`). */
  externalId: string;

  // ---- Roles & Permissions
  roles: Role[];
  permissions: Permission[];

  // ---- Authentication State
  isActive: boolean;
  emailVerified: boolean;
  phoneVerified: boolean;
  lastLoginAt: Date | null;
  lastPasswordChangeAt: Date | null;
  mfaEnabled: boolean;

  // ---- Related Entities
  identity: UserIdentity;
  contact: UserContact;
  address: Address | null;
  preferences: UserPreferences;
  emergencyContacts: UserEmergencyContacts;
  employment: UserEmployment;
  compliance: UserCompliance;
  externalIds: ExternalIds;
  audit: UserAudit;
}

// For backwards compatibility with existing code
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

export type NewUser = Omit<User, 'id' | 'audit'>;

export type UserPatch = Partial<
  Pick<
    User,
    | 'username'
    | 'email'
    | 'isActive'
    | 'mfaEnabled'
    | 'phoneVerified'
    | 'identity'
    | 'contact'
    | 'address'
    | 'preferences'
    | 'emergencyContacts'
    | 'employment'
    | 'compliance'
    | 'externalIds'
  >
>;

/**
 * Input for creating a new user.
 */
export interface NewUserInput {
  // ---- Identity & Authentication
  username: string;
  email: string;
  externalId: string;

  // ---- Profile Data
  identity: UserIdentityInput;
  contact?: UserContactInput;
  address?: AddressInput;
  preferences?: UserPreferencesInput;
  emergencyContacts?: UserEmergencyContactsInput;

  // ---- Roles & Permissions (optional, defaults to ['user'])
  roles?: string[];
  permissions?: string[];

  // ---- Compliance (optional)
  employment?: UserEmploymentInput;
  compliance?: UserComplianceInput;
  externalIds?: ExternalIdsInput;
}

/**
 * Input for patching (partial update) an existing user.
 */
export interface UserPatchInput {
  // ---- Identity & Authentication
  username?: string;
  email?: string;

  // ---- Profile Data
  identity?: Partial<UserIdentityInput>;
  contact?: UserContactInput;
  address?: AddressInput;
  preferences?: UserPreferencesInput;
  emergencyContacts?: UserEmergencyContactsInput;

  // ---- Auth State
  isActive?: boolean;
  mfaEnabled?: boolean;
  phoneVerified?: boolean;

  // ---- Roles & Permissions
  roles?: string[];
  permissions?: string[];

  // ---- Compliance
  employment?: UserEmploymentInput;
  compliance?: UserComplianceInput;
  externalIds?: ExternalIdsInput;
}

// ---------------------------------------------------------------- Builders

/**
 * Build a new user from input, applying normalization and validation.
 */
export function buildNewUser(input: NewUserInput): NewUser {
  if (!input.externalId || input.externalId.trim().length === 0) {
    throw new ValidationError('externalId is required');
  }

  const roles = (input.roles || ['user']).map((r) => assertRole(r));
  const permissions = (input.permissions || []).map((p) => assertPermission(p));

  return {
    username: normalizeUsername(input.username),
    email: normalizeEmail(input.email),
    externalId: input.externalId.trim(),
    roles,
    permissions,
    isActive: true,
    emailVerified: false,
    phoneVerified: false,
    lastLoginAt: null,
    lastPasswordChangeAt: new Date(),
    mfaEnabled: false,
    identity: buildUserIdentity(input.identity),
    contact: buildUserContact(input.contact),
    address: input.address ? buildAddress(input.address) : null,
    preferences: buildUserPreferences(input.preferences),
    emergencyContacts: buildUserEmergencyContacts(input.emergencyContacts),
    employment: buildUserEmployment(input.employment),
    compliance: buildUserCompliance(input.compliance),
    externalIds: buildExternalIds(input.externalIds),
  };
}

/**
 * Build a patch (partial update) from input, applying normalization and validation.
 * Only fields present in the input appear in the result.
 */
export function buildUserPatch(input: UserPatchInput): UserPatch {
  if (Object.keys(input).length === 0) {
    throw new ValidationError('At least one field must be provided');
  }

  const patch: UserPatch = {};

  // ---- Identity & Auth
  if (input.username !== undefined) patch.username = normalizeUsername(input.username);
  if (input.email !== undefined) patch.email = normalizeEmail(input.email);
  if (input.isActive !== undefined) patch.isActive = input.isActive;
  if (input.mfaEnabled !== undefined) patch.mfaEnabled = input.mfaEnabled;
  if (input.phoneVerified !== undefined) patch.phoneVerified = input.phoneVerified;

  // ---- Profile
  if (input.identity !== undefined) {
    const partial = input.identity as Partial<UserIdentityInput>;
    if (Object.keys(partial).length > 0) {
      const current = buildUserIdentity({ displayName: 'temp' });
      patch.identity = { ...current, ...partial };
    }
  }
  if (input.contact !== undefined) patch.contact = buildUserContact(input.contact);
  if (input.address !== undefined) patch.address = buildAddress(input.address);
  if (input.preferences !== undefined) patch.preferences = buildUserPreferences(input.preferences);
  if (input.emergencyContacts !== undefined)
    patch.emergencyContacts = buildUserEmergencyContacts(input.emergencyContacts);

  // ---- Compliance
  if (input.employment !== undefined) patch.employment = buildUserEmployment(input.employment);
  if (input.compliance !== undefined) patch.compliance = buildUserCompliance(input.compliance);
  if (input.externalIds !== undefined) patch.externalIds = buildExternalIds(input.externalIds);

  if (Object.keys(patch).length === 0) {
    throw new ValidationError('At least one field must be provided');
  }

  return patch;
}

/**
 * Backwards-compatibility helper: convert new User structure to NextOfKin.
 */
export function userToNextOfKin(user: User): NextOfKin | null {
  const contact = user.emergencyContacts.primaryContact || user.emergencyContacts.nextOfKin;
  if (!contact) return null;
  return {
    fullName: contact.fullName,
    relationship: contact.relationship,
    phone: contact.phone,
    email: contact.email,
  };
}

/**
 * Backwards-compatibility helper: convert new User structure to ContactPerson.
 */
export function userToContactPerson(user: User): ContactPerson | null {
  const contact = user.emergencyContacts.primaryContact;
  if (!contact) return null;
  return {
    fullName: contact.fullName,
    phone: contact.phone,
    email: contact.email,
  };
}
