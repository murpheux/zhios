-- Refactor User table to use nested JSON structure for profile data
-- Move flat columns (firstName, lastName, dateOfBirth, sex, nextOfKin, contactPerson)
-- into nested objects (identity, contact, emergencyContacts, compliance)

-- First, add new JSON columns with default empty objects/arrays
ALTER TABLE "users"
ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "email_verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "phone_verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "last_login_at" TIMESTAMP(3),
ADD COLUMN "last_password_change_at" TIMESTAMP(3),
ADD COLUMN "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "roles" JSONB NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN "permissions" JSONB NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN "identity" JSONB NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN "contact" JSONB NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN "preferences" JSONB NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN "emergency_contacts" JSONB NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN "employment" JSONB NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN "compliance" JSONB NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN "external_ids" JSONB NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN "audit" JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Migrate data from old columns to new structure
UPDATE "users"
SET
  "identity" = jsonb_build_object(
    'displayName', COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''),
    'middleName', NULL,
    'preferredName', NULL,
    'profilePhotoUrl', NULL,
    'nationality', NULL,
    'preferredLanguage', NULL,
    'maritalStatus', NULL,
    'dateOfBirth', date_of_birth,
    'sex', sex
  ),
  "contact" = jsonb_build_object(
    'phoneNumber', NULL,
    'mobileNumber', NULL,
    'secondaryEmail', NULL
  ),
  "emergency_contacts" = jsonb_build_object(
    'primaryContact', next_of_kin,
    'secondaryContact', NULL,
    'nextOfKin', next_of_kin
  ),
  "compliance" = jsonb_build_object(
    'encryptedTaxId', encrypted_tax_id,
    'termsAcceptedAt', NULL,
    'privacyPolicyAcceptedAt', NULL,
    'marketingConsent', false,
    'marketingConsentUpdatedAt', NULL
  ),
  "audit" = jsonb_build_object(
    'createdBy', NULL,
    'updatedBy', NULL,
    'deletedAt', NULL,
    'deactivatedAt', NULL,
    'isDeleted', false,
    'createdAt', created_at,
    'updatedAt', updated_at
  ),
  "last_password_change_at" = created_at,
  "is_active" = true,
  "email_verified" = false,
  "phone_verified" = false,
  "mfa_enabled" = false;

-- Now drop the old columns
ALTER TABLE "users"
DROP COLUMN "first_name",
DROP COLUMN "last_name",
DROP COLUMN "date_of_birth",
DROP COLUMN "next_of_kin",
DROP COLUMN "contact_person",
DROP COLUMN "sex",
DROP COLUMN "encrypted_tax_id";

-- Rename new columns to drop the temp naming
ALTER TABLE "users"
RENAME COLUMN "emergency_contacts" TO "emergency_contacts";

-- Add constraint for unique external_id if not already present
CREATE UNIQUE INDEX IF NOT EXISTS "users_external_id_key" ON "users"("external_id");
