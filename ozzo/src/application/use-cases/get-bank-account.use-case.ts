import { NotFoundError, type BankAccount } from '../../domain';
import type { Actor } from '../actor';
import { toBankAccountDto, type BankAccountDto } from '../dtos';
import type { BankAccountRepository } from '../ports';
import { loadAuthorizedUser, type UserAccessDeps } from '../user-access';

/** Loads an account scoped to its owner; a mismatched user/account pair is a 404, not a leak. */
export async function loadOwnedAccount(
  deps: UserAccessDeps,
  accounts: BankAccountRepository,
  userId: string,
  accountId: string,
  actor: Actor,
): Promise<BankAccount> {
  await loadAuthorizedUser(deps, userId, actor);
  const account = await accounts.findById(accountId);
  if (!account || account.userId !== userId) throw new NotFoundError('Bank account');
  return account;
}

export class GetBankAccountUseCase {
  constructor(
    private readonly deps: UserAccessDeps,
    private readonly accounts: BankAccountRepository,
  ) {}

  async execute(userId: string, accountId: string, actor: Actor): Promise<BankAccountDto> {
    return toBankAccountDto(await loadOwnedAccount(this.deps, this.accounts, userId, accountId, actor));
  }
}
