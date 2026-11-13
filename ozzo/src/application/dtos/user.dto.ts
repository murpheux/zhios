import { z } from 'zod';
import type { User } from '../../domain';

export const CreateUserRequestSchema = z
  .object({
    username: z.string(),
    email: z.string(),
    firstName: z.string(),
    lastName: z.string(),
  })
  .strict();
export type CreateUserRequest = z.infer<typeof CreateUserRequestSchema>;

export const UpdateUserRequestSchema = z
  .object({
    username: z.string().optional(),
    email: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
  })
  .strict();
export type UpdateUserRequest = z.infer<typeof UpdateUserRequestSchema>;

/** Wire/cache representation (dates as ISO strings, JSON-safe). */
export interface UserDto {
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
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
