import type { AccountType, BankAccount, NewBankAccount } from '../../domain';

export interface BankAccountRepository {
  /** Throws ConflictError on duplicate account number. */
  create(account: NewBankAccount): Promise<BankAccount>;
  findById(id: string): Promise<BankAccount | null>;
  listByUser(userId: string): Promise<BankAccount[]>;
  /** Throws NotFoundError if missing. */
  update(id: string, patch: { accountType: AccountType }): Promise<BankAccount>;
  delete(id: string): Promise<void>;
}
