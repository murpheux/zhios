import type { AddressRegion } from './address';
import { ValidationError } from './errors';

export const ACCOUNT_TYPES = ['checking', 'savings'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,32}$/;
const ACCOUNT_NUMBER_PATTERN = /^\d{8,17}$/;
const MAX_NAME_LENGTH = 100;

export function normalizeEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    throw new ValidationError('Invalid email address');
  }
  return email;
}

export function normalizeUsername(raw: string): string {
  const username = raw.trim();
  if (!USERNAME_PATTERN.test(username)) {
    throw new ValidationError('Username must be 3-32 characters of letters, digits, ".", "_" or "-"');
  }
  return username;
}

export function normalizeName(raw: string, field: string): string {
  const name = raw.trim();
  if (name.length === 0 || name.length > MAX_NAME_LENGTH) {
    throw new ValidationError(`${field} must be 1-${MAX_NAME_LENGTH} characters`);
  }
  return name;
}

export function normalizeAccountNumber(raw: string): string {
  const value = raw.trim();
  if (!ACCOUNT_NUMBER_PATTERN.test(value)) {
    throw new ValidationError('Account number must be 8-17 digits');
  }
  return value;
}

export function assertAccountType(value: string): AccountType {
  if (!(ACCOUNT_TYPES as readonly string[]).includes(value)) {
    throw new ValidationError(`Account type must be one of: ${ACCOUNT_TYPES.join(', ')}`);
  }
  return value as AccountType;
}

// ---------------------------------------------------------------- address

const MAX_ADDRESS_FIELD_LENGTH = 100;

const US_STATES = new Set(
  'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY AS GU MP PR VI'.split(' '),
);
const CA_PROVINCES = new Set('AB BC MB NB NL NS NT NU ON PE QC SK YT'.split(' '));

const US_POSTAL = /^\d{5}(-\d{4})?$/;
// Letters D, F, I, O, Q, U never appear; W and Z are not valid first letters.
const CA_POSTAL = /^([ABCEGHJKLMNPRSTVXY]\d[ABCEGHJ-NPRSTV-Z])\s?(\d[ABCEGHJ-NPRSTV-Z]\d)$/;
const UK_POSTAL = /^([A-Z]{1,2}\d[A-Z\d]?)\s?(\d[ABD-HJLNP-UW-Z]{2})$/;

function normalizeText(raw: string, field: string): string {
  const value = raw.trim().replace(/\s+/g, ' ');
  if (value.length === 0 || value.length > MAX_ADDRESS_FIELD_LENGTH) {
    throw new ValidationError(`${field} must be 1-${MAX_ADDRESS_FIELD_LENGTH} characters`);
  }
  return value;
}

export function normalizeStreet(raw: string): string {
  return normalizeText(raw, 'street');
}

export function normalizeCity(raw: string): string {
  return normalizeText(raw, 'city');
}

export function normalizeStateProvince(raw: string, region: AddressRegion): string {
  const value = normalizeText(raw, 'stateProvince');
  if (region === 'UK') return value;
  const code = value.toUpperCase();
  const valid = region === 'US' ? US_STATES : CA_PROVINCES;
  if (!valid.has(code)) {
    throw new ValidationError(`Invalid ${region === 'US' ? 'state' : 'province'} code for ${region}`);
  }
  return code;
}

export function normalizePostalCode(raw: string, region: AddressRegion): string {
  const value = raw.trim().toUpperCase();
  switch (region) {
    case 'US':
      if (US_POSTAL.test(value)) return value;
      break;
    case 'CA': {
      const m = CA_POSTAL.exec(value);
      if (m) return `${m[1]} ${m[2]}`;
      break;
    }
    case 'UK': {
      const m = UK_POSTAL.exec(value);
      if (m) return `${m[1]} ${m[2]}`;
      break;
    }
  }
  throw new ValidationError(`Invalid postal code for ${region}`);
}

// ---------------------------------------------------------------- profile

export const SEX_VALUES = ['male', 'female', "won't-declare"] as const;
export type Sex = (typeof SEX_VALUES)[number];

export function assertSex(value: string): Sex {
  if (!(SEX_VALUES as readonly string[]).includes(value)) {
    throw new ValidationError(`Sex must be one of: ${SEX_VALUES.join(', ')}`);
  }
  return value as Sex;
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MIN_BIRTH_YEAR = 1900;

/** Parses `YYYY-MM-DD` into a UTC-midnight Date; rejects impossible, future or pre-1900 dates. */
export function normalizeDateOfBirth(raw: string, now: Date = new Date()): Date {
  const m = DATE_PATTERN.exec(raw.trim());
  if (!m) throw new ValidationError('dateOfBirth must be YYYY-MM-DD');
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new ValidationError('dateOfBirth is not a valid calendar date');
  }
  if (year < MIN_BIRTH_YEAR || date.getTime() > now.getTime()) {
    throw new ValidationError('dateOfBirth is out of range');
  }
  return date;
}

const PHONE_PATTERN = /^\+?[0-9][0-9 ()-]{5,18}[0-9]$/;

export function normalizePhone(raw: string, field = 'phone'): string {
  const phone = raw.trim();
  if (!PHONE_PATTERN.test(phone)) throw new ValidationError(`${field} is not a valid phone number`);
  return phone;
}

// ---------------------------------------------------------------- SIN / SSN

function luhnValid(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/**
 * Validates a Canadian SIN (Luhn) or US SSN for the address region and returns the bare 9 digits.
 * The result is plaintext and MUST be passed through SensitiveDataPort before storage.
 */
export function normalizeTaxId(raw: string, region: AddressRegion): string {
  if (region === 'UK') {
    throw new ValidationError('SIN/SSN is only supported for US and CA addresses');
  }
  const digits = raw.replace(/[\s-]/g, '');
  if (!/^\d{9}$/.test(digits)) throw new ValidationError('SIN/SSN must be 9 digits');
  if (region === 'CA') {
    if (digits[0] === '0' || digits[0] === '8' || !luhnValid(digits)) {
      throw new ValidationError('Invalid SIN');
    }
    return digits;
  }
  const area = Number(digits.slice(0, 3));
  if (area === 0 || area === 666 || area >= 900 || digits.slice(3, 5) === '00' || digits.slice(5) === '0000') {
    throw new ValidationError('Invalid SSN');
  }
  return digits;
}
