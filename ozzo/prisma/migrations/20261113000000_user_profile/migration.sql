-- AlterTable
ALTER TABLE "users"
  ADD COLUMN "address" JSONB,
  ADD COLUMN "date_of_birth" DATE,
  ADD COLUMN "next_of_kin" JSONB,
  ADD COLUMN "contact_person" JSONB,
  ADD COLUMN "sex" TEXT,
  ADD COLUMN "encrypted_tax_id" TEXT;
