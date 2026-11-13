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
    firstName: z.string(),
    lastName: z.string(),
    ...profileRequestShape,
  })
  .strict();
export type CreateUserRequest = z.infer<typeof CreateUserRequestSchema>;

export const UpdateUserRequestSchema = z
  .object({
    username: z.string().optional(),
    email: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    ...profileRequestShape,
  })
  .strict();
export type UpdateUserRequest = z.infer<typeof UpdateUserRequestSchema>;

/** Wire/cache representation (dates as ISO strings, JSON-safe). */
export interface UserDto extends UserProfileFieldsDto {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  externalId: string;
  createdAt: string;
  updatedAt: string;
}

export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    externalId: user.externalId,
    ...toProfileFieldsDto(user),
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
