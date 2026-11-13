import { z } from 'zod';
import type { BankAccount } from '../../domain';
import type { AccountType } from '../../domain';

export const LinkBankAccountRequestSchema = z
  .object({
    accountType: z.string(),
    accountNumber: z.string().optional(),
  })
  .strict();
export type LinkBankAccountRequest = z.infer<typeof LinkBankAccountRequestSchema>;

export const UpdateBankAccountRequestSchema = z.object({ accountType: z.string() }).strict();
export type UpdateBankAccountRequest = z.infer<typeof UpdateBankAccountRequestSchema>;

export interface BankAccountDto {
  id: string;
  userId: string;
  accountNumber: string;
  accountType: AccountType;
  /** Integer minor units as a decimal string (safe for values above 2^53). */
  balance: string;
  createdAt: string;
  updatedAt: string;
}

export function toBankAccountDto(account: BankAccount): BankAccountDto {
  return {
    id: account.id,
    userId: account.userId,
    accountNumber: account.accountNumber,
    accountType: account.accountType,
    balance: account.balance.toString(),
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
  };
}
