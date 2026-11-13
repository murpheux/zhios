import type { PrismaClient } from '@prisma/client';
import type { UserRepository } from '../application/ports';
import { NotFoundError, type NewUser, type User, type UserPatch } from '../domain';
import { isRecordNotFound, rethrowUniqueViolation } from './prisma-errors';

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(user: NewUser): Promise<User> {
    try {
      return await this.prisma.user.create({ data: user });
    } catch (err) {
      return rethrowUniqueViolation(err, 'User');
    }
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByExternalId(externalId: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { externalId } });
  }

  async update(id: string, patch: UserPatch): Promise<User> {
    try {
      return await this.prisma.user.update({ where: { id }, data: patch });
    } catch (err) {
      if (isRecordNotFound(err)) throw new NotFoundError('User');
      return rethrowUniqueViolation(err, 'User');
    }
  }
}
