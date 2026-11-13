import { Prisma, type PrismaClient, type User as UserRow } from '@prisma/client';
import type { UserRepository } from '../application/ports';
import {
  NotFoundError,
  type Address,
  type ContactPerson,
  type NewUser,
  type NextOfKin,
  type Sex,
  type User,
  type UserPatch,
} from '../domain';
import { isRecordNotFound, rethrowUniqueViolation } from './prisma-errors';

// JSON columns: null input must be written as Prisma.DbNull, not undefined/null.
const json = (v: object | null | undefined) =>
  v === undefined ? undefined : v === null ? Prisma.DbNull : (v as Prisma.InputJsonObject);

function toData(input: NewUser | UserPatch) {
  const { address, nextOfKin, contactPerson, ...rest } = input;
  return {
    ...rest,
    address: json(address),
    nextOfKin: json(nextOfKin),
    contactPerson: json(contactPerson),
  };
}

function toDomain(row: UserRow): User {
  return {
    ...row,
    address: row.address as Address | null,
    nextOfKin: row.nextOfKin as NextOfKin | null,
    contactPerson: row.contactPerson as ContactPerson | null,
    sex: row.sex as Sex | null,
  };
}

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(user: NewUser): Promise<User> {
    try {
      return toDomain(await this.prisma.user.create({ data: toData(user) as Prisma.UserCreateInput }));
    } catch (err) {
      return rethrowUniqueViolation(err, 'User');
    }
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async findByExternalId(externalId: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { externalId } });
    return row ? toDomain(row) : null;
  }

  async update(id: string, patch: UserPatch): Promise<User> {
    try {
      return toDomain(await this.prisma.user.update({ where: { id }, data: toData(patch) }));
    } catch (err) {
      if (isRecordNotFound(err)) throw new NotFoundError('User');
      return rethrowUniqueViolation(err, 'User');
    }
  }
}
