import type { Actor } from '../actor';
import { toBankAccountDto, type BankAccountDto } from '../dtos';
import type { BankAccountRepository } from '../ports';
import { loadAuthorizedUser, type UserAccessDeps } from '../user-access';

export class ListBankAccountsUseCase {
  constructor(
    private readonly deps: UserAccessDeps,
    private readonly accounts: BankAccountRepository,
  ) {}

  async execute(userId: string, actor: Actor): Promise<BankAccountDto[]> {
    await loadAuthorizedUser(this.deps, userId, actor);
    return (await this.accounts.listByUser(userId)).map(toBankAccountDto);
  }
}
