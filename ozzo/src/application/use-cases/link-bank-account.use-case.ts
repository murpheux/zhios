import { buildNewBankAccount, ConflictError } from '../../domain';
import type { Actor } from '../actor';
import { LinkBankAccountRequestSchema, parseDto, toBankAccountDto, type BankAccountDto } from '../dtos';
import type { AccountNumberGenerator, BankAccountRepository } from '../ports';
import { loadAuthorizedUser, type UserAccessDeps } from '../user-access';

const MAX_GENERATION_ATTEMPTS = 5;

export class LinkBankAccountUseCase {
  constructor(
    private readonly deps: UserAccessDeps,
    private readonly accounts: BankAccountRepository,
    private readonly numbers: AccountNumberGenerator,
  ) {}

  async execute(userId: string, input: unknown, actor: Actor): Promise<BankAccountDto> {
    const dto = parseDto(LinkBankAccountRequestSchema, input);
    await loadAuthorizedUser(this.deps, userId, actor);

    if (dto.accountNumber !== undefined) {
      return this.create(userId, dto.accountType, dto.accountNumber);
    }
    // Generated numbers can collide on the unique index; retry a bounded number of times.
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.create(userId, dto.accountType, this.numbers.generate());
      } catch (err) {
        if (!(err instanceof ConflictError) || attempt >= MAX_GENERATION_ATTEMPTS) throw err;
      }
    }
  }

  private async create(userId: string, accountType: string, accountNumber: string): Promise<BankAccountDto> {
    const account = buildNewBankAccount({ userId, accountType, accountNumber });
    return toBankAccountDto(await this.accounts.create(account));
  }
}
