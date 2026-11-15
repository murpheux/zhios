import { randomUUID } from 'node:crypto';
import type { BankAccountRepository, UserRepository } from '../../src/application/ports';
import {
  ConflictError,
  NotFoundError,
  buildUserAudit,
  type AccountType,
  type BankAccount,
  type NewBankAccount,
  type NewUser,
  type User,
  type UserPatch,
} from '../../src/domain';

export class InMemoryUserRepository implements UserRepository {
  readonly items = new Map<string, User>();
  findByIdCalls = 0;

  async create(user: NewUser): Promise<User> {
    for (const u of this.items.values()) {
      if (u.username === user.username || u.email === user.email || u.externalId === user.externalId) {
        throw new ConflictError('User already exists');
      }
    }
    const now = new Date();
    const created: User = {
      ...user,
      id: randomUUID(),
      audit: buildUserAudit({ createdAt: now, updatedAt: now }),
    };
    this.items.set(created.id, created);
    return created;
  }

  async findById(id: string): Promise<User | null> {
    this.findByIdCalls++;
    return this.items.get(id) ?? null;
  }

  async findByExternalId(externalId: string): Promise<User | null> {
    return [...this.items.values()].find((u) => u.externalId === externalId) ?? null;
  }

  async update(id: string, patch: UserPatch): Promise<User> {
    const existing = this.items.get(id);
    if (!existing) throw new NotFoundError('User');
    const updated = { ...existing, ...patch, updatedAt: new Date() };
    this.items.set(id, updated);
    return updated;
  }
}

export class InMemoryBankAccountRepository implements BankAccountRepository {
  readonly items = new Map<string, BankAccount>();

  async create(account: NewBankAccount): Promise<BankAccount> {
    for (const a of this.items.values()) {
      if (a.accountNumber === account.accountNumber) throw new ConflictError('Account exists');
    }
    const now = new Date();
    const created: BankAccount = { ...account, id: randomUUID(), createdAt: now, updatedAt: now };
    this.items.set(created.id, created);
    return created;
  }

  async findById(id: string): Promise<BankAccount | null> {
    return this.items.get(id) ?? null;
  }

  async listByUser(userId: string): Promise<BankAccount[]> {
    return [...this.items.values()].filter((a) => a.userId === userId);
  }

  async update(id: string, patch: { accountType: AccountType }): Promise<BankAccount> {
    const existing = this.items.get(id);
    if (!existing) throw new NotFoundError('Bank account');
    const updated = { ...existing, ...patch, updatedAt: new Date() };
    this.items.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    if (!this.items.delete(id)) throw new NotFoundError('Bank account');
  }
}
