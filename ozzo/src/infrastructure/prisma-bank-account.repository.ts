import type { PrismaClient } from '@prisma/client';
import type { BankAccountRepository } from '../application/ports';
import { NotFoundError, type AccountType, type BankAccount, type NewBankAccount } from '../domain';
import { isRecordNotFound, rethrowUniqueViolation } from './prisma-errors';

export class PrismaBankAccountRepository implements BankAccountRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(account: NewBankAccount): Promise<BankAccount> {
    try {
      return await this.prisma.bankAccount.create({ data: account });
    } catch (err) {
      return rethrowUniqueViolation(err, 'Bank account');
    }
  }

  findById(id: string): Promise<BankAccount | null> {
    return this.prisma.bankAccount.findUnique({ where: { id } });
  }

  listByUser(userId: string): Promise<BankAccount[]> {
    return this.prisma.bankAccount.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
  }

  async update(id: string, patch: { accountType: AccountType }): Promise<BankAccount> {
    try {
      return await this.prisma.bankAccount.update({ where: { id }, data: patch });
    } catch (err) {
      if (isRecordNotFound(err)) throw new NotFoundError('Bank account');
      throw err;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.prisma.bankAccount.delete({ where: { id } });
    } catch (err) {
      if (isRecordNotFound(err)) throw new NotFoundError('Bank account');
      throw err;
    }
  }
}
