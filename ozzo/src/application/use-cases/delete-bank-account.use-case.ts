import { assertClosable } from '../../domain';
import type { Actor } from '../actor';
import type { BankAccountRepository } from '../ports';
import type { UserAccessDeps } from '../user-access';
import { loadOwnedAccount } from './get-bank-account.use-case';

export class DeleteBankAccountUseCase {
  constructor(
    private readonly deps: UserAccessDeps,
    private readonly accounts: BankAccountRepository,
  ) {}

  async execute(userId: string, accountId: string, actor: Actor): Promise<void> {
    const account = await loadOwnedAccount(this.deps, this.accounts, userId, accountId, actor);
    assertClosable(account);
    await this.accounts.delete(accountId);
  }
}
