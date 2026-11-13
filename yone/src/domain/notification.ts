import { DomainError, ValidationError } from './errors';

export const DEFAULT_TARGET = 'default';

const EMAIL_PATTERN = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[^\s@<>()[\],;:"]+$/;
const E164_PATTERN = /^\+[1-9]\d{6,14}$/;
const TARGET_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export const MAX_RECIPIENTS = 50;
export const MAX_SMS_LENGTH = 1600;
export const MAX_CHAT_TEXT_LENGTH = 4000;
export const MAX_SUBJECT_LENGTH = 200;
export const MAX_EMAIL_BODY_LENGTH = 100_000;

// 503: the channel's provider credentials are not configured on this deployment.
export class ChannelNotConfiguredError extends DomainError {
  readonly httpStatus = 503;
  readonly code = 'CHANNEL_NOT_CONFIGURED';

  constructor(channel: string) {
    super(`Notification channel '${channel}' is not configured`);
  }
}

const fail = (message: string): never => {
  throw new ValidationError(message);
};

export const assertEmailAddress = (value: string): string => {
  const email = value.trim();
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) fail('Invalid email address');
  return email;
};

export const assertE164 = (value: string): string => {
  const phone = value.trim();
  if (!E164_PATTERN.test(phone)) fail('Phone number must be E.164 (e.g. +14035550123)');
  return phone;
};

export const assertTarget = (value: string | undefined): string => {
  const target = value ?? DEFAULT_TARGET;
  if (!TARGET_PATTERN.test(target)) fail('Invalid target name');
  return target;
};

export const assertText = (value: string, field: string, max: number): string => {
  if (value.trim().length === 0) fail(`${field} must not be blank`);
  if (value.length > max) fail(`${field} exceeds ${max} characters`);
  return value;
};
