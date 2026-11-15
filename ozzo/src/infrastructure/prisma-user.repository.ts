import { Prisma, type PrismaClient, type User as UserRow } from '@prisma/client';
import type { UserRepository } from '../application/ports';
import {
  NotFoundError,
  type Address,
  type User,
  type NewUser,
  type UserPatch,
  buildUserAudit,
  type UserAudit,
} from '../domain';
import { isRecordNotFound, rethrowUniqueViolation } from './prisma-errors';

// JSON columns: null input must be written as Prisma.DbNull, not undefined/null.
const json = (v: object | null | undefined) =>
  v === undefined ? undefined : v === null ? Prisma.DbNull : (v as Prisma.InputJsonObject);

/**
 * Convert domain NewUser or UserPatch to Prisma-compatible data format.
 * Serializes all nested objects into JSON.
 */
function toData(input: NewUser | UserPatch) {
  const {
    id,
    audit, // audit is computed, not stored in input
    ...rest
  } = input as any;

  return {
    ...rest,
    address: json(rest.address),
    identity: json(rest.identity),
    contact: json(rest.contact),
    preferences: json(rest.preferences),
    emergencyContacts: json(rest.emergencyContacts),
    employment: json(rest.employment),
    compliance: json(rest.compliance),
    externalIds: json(rest.externalIds),
    roles: json(rest.roles || []),
    permissions: json(rest.permissions || []),
  };
}

/**
 * Convert Prisma UserRow to domain User object.
 * Deserializes all JSON columns into their respective domain objects.
 */
function toDomain(row: UserRow): User {
  const auditObj = typeof row.audit === 'object' && row.audit !== null ? (row.audit as any) : {};
  const audit = buildUserAudit({
    createdBy: auditObj?.createdBy || null,
    updatedBy: auditObj?.updatedBy || null,
    deletedAt: auditObj?.deletedAt ? new Date(auditObj.deletedAt) : null,
    deactivatedAt: auditObj?.deactivatedAt ? new Date(auditObj.deactivatedAt) : null,
    isDeleted: auditObj?.isDeleted ?? false,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

  return {
    id: row.id,
    username: row.username,
    email: row.email,
    externalId: row.externalId,
    roles: (Array.isArray(row.roles) ? row.roles : []) as any,
    permissions: (Array.isArray(row.permissions) ? row.permissions : []) as any,
    isActive: row.isActive ?? true,
    emailVerified: row.emailVerified ?? false,
    phoneVerified: row.phoneVerified ?? false,
    lastLoginAt: row.lastLoginAt || null,
    lastPasswordChangeAt: row.lastPasswordChangeAt || null,
    mfaEnabled: row.mfaEnabled ?? false,
    identity: (typeof row.identity === 'object' && row.identity !== null ? row.identity : {}) as any,
    contact: (typeof row.contact === 'object' && row.contact !== null ? row.contact : {}) as any,
    address: (typeof row.address === 'object' && row.address !== null ? (row.address as unknown as Address) : null) as Address | null,
    preferences: (typeof row.preferences === 'object' && row.preferences !== null ? row.preferences : {}) as any,
    emergencyContacts: (typeof row.emergencyContacts === 'object' && row.emergencyContacts !== null ? row.emergencyContacts : {}) as any,
    employment: (typeof row.employment === 'object' && row.employment !== null ? row.employment : {}) as any,
    compliance: (typeof row.compliance === 'object' && row.compliance !== null ? row.compliance : {}) as any,
    externalIds: (typeof row.externalIds === 'object' && row.externalIds !== null ? row.externalIds : {}) as any,
    audit,
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
