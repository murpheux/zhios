import { ConflictError } from './errors';
import type { AccountType } from './value-objects';
import { assertAccountType, normalizeAccountNumber } from './value-objects';

export interface BankAccount {
  id: string;
  userId: string;
  accountNumber: string;
  accountType: AccountType;
  /** Integer minor units (cents/satoshis). Never a float. */
  balance: bigint;
  createdAt: Date;
  updatedAt: Date;
}

export type NewBankAccount = Omit<BankAccount, 'id' | 'createdAt' | 'updatedAt'>;

export function buildNewBankAccount(input: {
  userId: string;
  accountNumber: string;
  accountType: string;
}): NewBankAccount {
  return {
    userId: input.userId,
    accountNumber: normalizeAccountNumber(input.accountNumber),
    accountType: assertAccountType(input.accountType),
    balance: 0n,
  };
}

/** Accounts holding funds cannot be closed. */
export function assertClosable(account: BankAccount): void {
  if (account.balance !== 0n) {
    throw new ConflictError('Account has a non-zero balance and cannot be closed');
  }
}
