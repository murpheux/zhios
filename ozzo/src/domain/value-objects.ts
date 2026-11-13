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
