import { assertEmploymentStatus, type EmploymentStatus } from './enums';
import { ValidationError } from './errors';

/**
 * User's employment information.
 */
export interface UserEmployment {
  employeeNumber: string | null;
  departmentId: string | null;
  jobTitle: string | null;
  managerId: string | null;
  hireDate: Date | null;
  employmentStatus: EmploymentStatus | null;
}

export interface UserEmploymentInput {
  employeeNumber?: string;
  departmentId?: string;
  jobTitle?: string;
  managerId?: string;
  hireDate?: string; // ISO date string
  employmentStatus?: string;
}

/**
 * Compliance and consent tracking.
 */
export interface UserCompliance {
  /** SIN/SSN ciphertext (plaintext never stored or returned). */
  encryptedTaxId: string | null;
  /** Timestamp when user accepted terms of service. */
  termsAcceptedAt: Date | null;
  /** Timestamp when user accepted privacy policy. */
  privacyPolicyAcceptedAt: Date | null;
  /** User has opted in to marketing communications. */
  marketingConsent: boolean;
  /** Timestamp when marketing consent was last updated. */
  marketingConsentUpdatedAt: Date | null;
}

export interface UserComplianceInput {
  encryptedTaxId?: string;
  termsAcceptedAt?: string; // ISO date
  privacyPolicyAcceptedAt?: string; // ISO date
  marketingConsent?: boolean;
  marketingConsentUpdatedAt?: string; // ISO date
}

/**
 * Audit and lifecycle information.
 */
export interface UserAudit {
  /** User ID that created this record. */
  createdBy: string | null;
  /** User ID that last updated this record. */
  updatedBy: string | null;
  /** Timestamp when user was soft-deleted. */
  deletedAt: Date | null;
  /** Timestamp when user was deactivated (inactive). */
  deactivatedAt: Date | null;
  /** Whether the user record is soft-deleted. */
  isDeleted: boolean;
  /** Standard record timestamps. */
  createdAt: Date;
  updatedAt: Date;
}

/**
 * External system identifiers for integrations (SSO, HRIS, etc.).
 */
export interface ExternalIds {
  okta?: string;
  azureAd?: string;
  google?: string;
  employeeSystem?: string;
}

export interface ExternalIdsInput {
  okta?: string;
  azureAd?: string;
  google?: string;
  employeeSystem?: string;
}

// ---------------------------------------------------------------- Builders

export function buildUserEmployment(input?: UserEmploymentInput): UserEmployment {
  return {
    employeeNumber: input?.employeeNumber || null,
    departmentId: input?.departmentId || null,
    jobTitle: input?.jobTitle || null,
    managerId: input?.managerId || null,
    hireDate: input?.hireDate ? new Date(input.hireDate) : null,
    employmentStatus: input?.employmentStatus
      ? assertEmploymentStatus(input.employmentStatus)
      : null,
  };
}

export function buildUserCompliance(input?: UserComplianceInput): UserCompliance {
  return {
    encryptedTaxId: input?.encryptedTaxId || null,
    termsAcceptedAt: input?.termsAcceptedAt ? new Date(input.termsAcceptedAt) : null,
    privacyPolicyAcceptedAt: input?.privacyPolicyAcceptedAt
      ? new Date(input.privacyPolicyAcceptedAt)
      : null,
    marketingConsent: input?.marketingConsent ?? false,
    marketingConsentUpdatedAt: input?.marketingConsentUpdatedAt
      ? new Date(input.marketingConsentUpdatedAt)
      : null,
  };
}

export function buildExternalIds(input?: ExternalIdsInput): ExternalIds {
  return {
    okta: input?.okta,
    azureAd: input?.azureAd,
    google: input?.google,
    employeeSystem: input?.employeeSystem,
  };
}

export function buildUserAudit(overrides?: {
  createdBy?: string | null;
  updatedBy?: string | null;
  deletedAt?: Date | null;
  deactivatedAt?: Date | null;
  isDeleted?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}): UserAudit {
  const now = new Date();
  return {
    createdBy: overrides?.createdBy || null,
    updatedBy: overrides?.updatedBy || null,
    deletedAt: overrides?.deletedAt || null,
    deactivatedAt: overrides?.deactivatedAt || null,
    isDeleted: overrides?.isDeleted ?? false,
    createdAt: overrides?.createdAt || now,
    updatedAt: overrides?.updatedAt || now,
  };
}
