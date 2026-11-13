import { assertAccountType } from '../../domain';
import type { Actor } from '../actor';
import { parseDto, toBankAccountDto, UpdateBankAccountRequestSchema, type BankAccountDto } from '../dtos';
import type { BankAccountRepository } from '../ports';
import type { UserAccessDeps } from '../user-access';
import { loadOwnedAccount } from './get-bank-account.use-case';

export class UpdateBankAccountUseCase {
  constructor(
    private readonly deps: UserAccessDeps,
    private readonly accounts: BankAccountRepository,
  ) {}

  async execute(userId: string, accountId: string, input: unknown, actor: Actor): Promise<BankAccountDto> {
    const dto = parseDto(UpdateBankAccountRequestSchema, input);
    const accountType = assertAccountType(dto.accountType);
    await loadOwnedAccount(this.deps, this.accounts, userId, accountId, actor);
    return toBankAccountDto(await this.accounts.update(accountId, { accountType }));
  }
}
