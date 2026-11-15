import { z } from 'zod';
import type { User } from '../../domain';
import { AddressRequestSchema } from './address.dto';
import { toProfileFieldsDto, type UserProfileFieldsDto } from './profile-fields.dto';

const NextOfKinRequestSchema = z
  .object({
    fullName: z.string(),
    relationship: z.string(),
    phone: z.string().optional(),
    email: z.string().optional(),
  })
  .strict();

const ContactPersonRequestSchema = z
  .object({ fullName: z.string(), phone: z.string(), email: z.string().optional() })
  .strict();

const profileRequestShape = {
  address: AddressRequestSchema.optional(),
  dateOfBirth: z.string().optional(),
  nextOfKin: NextOfKinRequestSchema.optional(),
  contactPerson: ContactPersonRequestSchema.optional(),
  sex: z.string().optional(),
  /** SIN (CA) / SSN (US); write-only, encrypted via SensitiveDataPort. Requires an address country. */
  taxId: z.string().optional(),
};

export const CreateUserRequestSchema = z
  .object({
    username: z.string(),
    email: z.string(),
    identity: z
      .object({
        displayName: z.string(),
        middleName: z.string().optional(),
        preferredName: z.string().optional(),
        dateOfBirth: z.string().optional(), // YYYY-MM-DD
        sex: z.string().optional(),
        nationality: z.string().optional(),
        preferredLanguage: z.string().optional(),
        maritalStatus: z.string().optional(),
        profilePhotoUrl: z.string().optional(),
      })
      .strict(),
    ...profileRequestShape,
  })
  .strict();
export type CreateUserRequest = z.infer<typeof CreateUserRequestSchema>;

export const UpdateUserRequestSchema = z
  .object({
    username: z.string().optional(),
    email: z.string().optional(),
    identity: z
      .object({
        displayName: z.string().optional(),
        middleName: z.string().optional(),
        preferredName: z.string().optional(),
        dateOfBirth: z.string().optional(), // YYYY-MM-DD
        sex: z.string().optional(),
        nationality: z.string().optional(),
        preferredLanguage: z.string().optional(),
        maritalStatus: z.string().optional(),
        profilePhotoUrl: z.string().optional(),
      })
      .strict()
      .optional(),
    ...profileRequestShape,
  })
  .strict();
export type UpdateUserRequest = z.infer<typeof UpdateUserRequestSchema>;

/** Wire/cache representation (dates as ISO strings, JSON-safe). */
export interface UserDto extends UserProfileFieldsDto {
  id: string;
  username: string;
  email: string;
  externalId: string;
  createdAt: string;
  updatedAt: string;
}

export function toUserDto(user: User): UserDto {
  const audit = (user.audit as any) || { createdAt: new Date(), updatedAt: new Date() };

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    externalId: user.externalId,
    ...toProfileFieldsDto(user),
    createdAt: audit.createdAt
      ? new Date(audit.createdAt).toISOString()
      : new Date().toISOString(),
    updatedAt: audit.updatedAt
      ? new Date(audit.updatedAt).toISOString()
      : new Date().toISOString(),
  };
}
