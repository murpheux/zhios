import { ConflictError } from '@zinga/shared-common';
import { parseSatsAmount } from '../../domain/value-objects/satoshi';
import type { LedgerRepositoryPort } from '../ports/ledger-repository.port';
import type { LedgerMovementService, WalletBalanceResult } from '../services/ledger-movement.service';

export interface RefundWalletInput {
  walletId: string;
  transactionId: string;
  amountSats: string;
}

// Service-only (transaction-service): returns funds of a send that failed. Idempotent by transactionId,
// and only allowed against an applied debit of the same wallet/amount — a refund can never mint funds.
export class RefundWalletUseCase {
  constructor(
    private readonly ledgerMovementService: LedgerMovementService,
    private readonly ledgerRepository: LedgerRepositoryPort,
  ) {}

  async execute(input: RefundWalletInput): Promise<WalletBalanceResult> {
    const debit = await this.ledgerRepository.findByKey(input.transactionId, 'debit', 'send');
    if (
      debit?.state !== 'applied' ||
      debit.walletId !== input.walletId ||
      debit.amountSats !== parseSatsAmount(input.amountSats)
    ) {
      throw new ConflictError(
        `No matching applied debit exists for transaction '${input.transactionId}'`,
        'REFUND_WITHOUT_DEBIT',
      );
    }
    return this.ledgerMovementService.apply({
      walletId: input.walletId,
      transactionId: input.transactionId,
      kind: 'credit',
      reason: 'refund',
      amountSats: input.amountSats,
    });
  }
}
