import type { LedgerMovementService, WalletBalanceResult } from '../services/ledger-movement.service';

export interface DebitWalletInput {
  walletId: string;
  transactionId: string;
  amountSats: string;
}

// Service-only (transaction-service): reserves funds for an outgoing send. Idempotent by transactionId.
export class DebitWalletUseCase {
  constructor(private readonly ledgerMovementService: LedgerMovementService) {}

  async execute(input: DebitWalletInput): Promise<WalletBalanceResult> {
    return this.ledgerMovementService.apply({
      walletId: input.walletId,
      transactionId: input.transactionId,
      kind: 'debit',
      reason: 'send',
      amountSats: input.amountSats,
    });
  }
}
