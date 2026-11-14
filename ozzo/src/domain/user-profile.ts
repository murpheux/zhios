import { normalizeName, normalizePhone, normalizeEmail } from './value-objects';
import { assertMaritalStatus, assertTheme, type MaritalStatus, type Theme } from './enums';
import { ValidationError } from './errors';

/**
 * Notification preferences for various channels.
 */
export interface NotificationPreferences {
  /** Email notifications enabled. */
  emailNotifications: boolean;
  /** SMS/text message notifications enabled. */
  smsNotifications: boolean;
  /** In-app notifications enabled. */
  inAppNotifications: boolean;
  /** Marketing and promotional communications. */
  marketingEmails: boolean;
}

/**
 * User's contact information.
 */
export interface UserContact {
  phoneNumber: string | null;
  mobileNumber: string | null;
  secondaryEmail: string | null;
}

export interface UserContactInput {
  phoneNumber?: string;
  mobileNumber?: string;
  secondaryEmail?: string;
}

/**
 * User's identity and demographic information.
 */
export interface UserIdentity {
  middleName: string | null;
  preferredName: string | null;
  displayName: string;
  profilePhotoUrl: string | null;
  nationality: string | null;
  preferredLanguage: string | null;
  maritalStatus: MaritalStatus | null;
  dateOfBirth: Date | null;
  sex: string | null;
}

export interface UserIdentityInput {
  middleName?: string;
  preferredName?: string;
  displayName: string;
  profilePhotoUrl?: string;
  nationality?: string;
  preferredLanguage?: string;
  maritalStatus?: string;
  dateOfBirth?: string; // YYYY-MM-DD
  sex?: string;
}

/**
 * User's preferences (theme, timezone, locale, notifications).
 */
export interface UserPreferences {
  timeZone: string | null;
  locale: string | null;
  theme: Theme;
  notificationPreferences: NotificationPreferences;
}

export interface UserPreferencesInput {
  timeZone?: string;
  locale?: string;
  theme?: string;
  notificationPreferences?: Partial<NotificationPreferences>;
}

/**
 * Emergency contact information.
 */
export interface EmergencyContact {
  fullName: string;
  relationship: string;
  phone: string;
  email?: string;
}

export interface EmergencyContactInput {
  fullName: string;
  relationship: string;
  phone: string;
  email?: string;
}

/**
 * Next of kin information (legacy, for backwards compatibility).
 */
export interface NextOfKin {
  fullName: string;
  relationship: string;
  phone?: string;
  email?: string;
}

export interface NextOfKinInput {
  fullName: string;
  relationship: string;
  phone?: string;
  email?: string;
}

/**
 * Emergency / contact persons.
 */
export interface UserEmergencyContacts {
  primaryContact: EmergencyContact | null;
  secondaryContact: EmergencyContact | null;
  /** Legacy field for backwards compatibility. */
  nextOfKin: NextOfKin | null;
}

export interface UserEmergencyContactsInput {
  primaryContact?: EmergencyContactInput;
  secondaryContact?: EmergencyContactInput;
  nextOfKin?: NextOfKinInput;
}

// ---------------------------------------------------------------- Builders

function buildContact(input: UserContactInput): UserContact {
  const contact: UserContact = {
    phoneNumber: null,
    mobileNumber: null,
    secondaryEmail: null,
  };
  if (input.phoneNumber) contact.phoneNumber = normalizePhone(input.phoneNumber, 'phoneNumber');
  if (input.mobileNumber) contact.mobileNumber = normalizePhone(input.mobileNumber, 'mobileNumber');
  if (input.secondaryEmail) contact.secondaryEmail = normalizeEmail(input.secondaryEmail);
  return contact;
}

function buildIdentity(input: UserIdentityInput): UserIdentity {
  if (!input.displayName || input.displayName.trim().length === 0) {
    throw new ValidationError('displayName is required');
  }
  const identity: UserIdentity = {
    middleName: null,
    preferredName: null,
    displayName: normalizeName(input.displayName, 'displayName'),
    profilePhotoUrl: input.profilePhotoUrl || null,
    nationality: input.nationality || null,
    preferredLanguage: input.preferredLanguage || null,
    maritalStatus: input.maritalStatus ? assertMaritalStatus(input.maritalStatus) : null,
    dateOfBirth: null,
    sex: input.sex || null,
  };
  if (input.middleName) identity.middleName = normalizeName(input.middleName, 'middleName');
  if (input.preferredName) identity.preferredName = normalizeName(input.preferredName, 'preferredName');
  return identity;
}

function buildEmergencyContact(input: EmergencyContactInput): EmergencyContact {
  const contact: EmergencyContact = {
    fullName: normalizeName(input.fullName, 'emergencyContact.fullName'),
    relationship: normalizeName(input.relationship, 'emergencyContact.relationship'),
    phone: normalizePhone(input.phone, 'emergencyContact.phone'),
  };
  if (input.email) contact.email = normalizeEmail(input.email);
  return contact;
}

function buildNextOfKin(input: NextOfKinInput): NextOfKin {
  const kin: NextOfKin = {
    fullName: normalizeName(input.fullName, 'nextOfKin.fullName'),
    relationship: normalizeName(input.relationship, 'nextOfKin.relationship'),
  };
  if (input.phone) kin.phone = normalizePhone(input.phone, 'nextOfKin.phone');
  if (input.email) kin.email = normalizeEmail(input.email);
  return kin;
}

export function buildUserContact(input?: UserContactInput): UserContact {
  if (!input) {
    return {
      phoneNumber: null,
      mobileNumber: null,
      secondaryEmail: null,
    };
  }
  return buildContact(input);
}

export function buildUserIdentity(input: UserIdentityInput): UserIdentity {
  return buildIdentity(input);
}

export function buildUserPreferences(input?: UserPreferencesInput): UserPreferences {
  return {
    timeZone: input?.timeZone || null,
    locale: input?.locale || null,
    theme: input?.theme ? assertTheme(input.theme) : 'system',
    notificationPreferences: {
      emailNotifications: input?.notificationPreferences?.emailNotifications ?? true,
      smsNotifications: input?.notificationPreferences?.smsNotifications ?? false,
      inAppNotifications: input?.notificationPreferences?.inAppNotifications ?? true,
      marketingEmails: input?.notificationPreferences?.marketingEmails ?? false,
    },
  };
}

export function buildUserEmergencyContacts(input?: UserEmergencyContactsInput): UserEmergencyContacts {
  return {
    primaryContact: input?.primaryContact ? buildEmergencyContact(input.primaryContact) : null,
    secondaryContact: input?.secondaryContact ? buildEmergencyContact(input.secondaryContact) : null,
    nextOfKin: input?.nextOfKin ? buildNextOfKin(input.nextOfKin) : null,
  };
}
