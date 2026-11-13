import type { Actor } from '../actor';
import { toBankAccountDto, type UserProfileDto } from '../dtos';
import type { BankAccountRepository } from '../ports';
import { loadAuthorizedUser, type UserAccessDeps } from '../user-access';

export class FetchUserProfileUseCase {
  constructor(
    private readonly deps: UserAccessDeps,
    private readonly accounts: BankAccountRepository,
  ) {}

  async execute(userId: string, actor: Actor): Promise<UserProfileDto> {
    const user = await loadAuthorizedUser(this.deps, userId, actor);
    const accounts = await this.accounts.listByUser(userId);
    const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0n);
    return { ...user, accounts: accounts.map(toBankAccountDto), totalBalance: totalBalance.toString() };
  }
}
