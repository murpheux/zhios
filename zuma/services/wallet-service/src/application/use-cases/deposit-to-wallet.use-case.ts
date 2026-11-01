import { ForbiddenError, type Actor } from '@zuma/shared-common';
import type { LedgerMovementService, WalletBalanceResult } from '../services/ledger-movement.service';

export interface DepositToWalletInput {
  amountSats: string;
  /** External, unique deposit reference (e.g. `<txid>:<vout>`); the idempotency key for the credit. */
  reference: string;
}

// Admin-only dev/test funding until a chain observer credits incoming payments. Idempotent by reference.
export class DepositToWalletUseCase {
  constructor(private readonly ledgerMovementService: LedgerMovementService) {}

  async execute(walletId: string, input: DepositToWalletInput, actor: Actor): Promise<WalletBalanceResult> {
    // Defense in depth: the route also enforces requireRole('admin').
    if (!actor.roles.includes('admin')) {
      throw new ForbiddenError("Requires role 'admin'");
    }
    return this.ledgerMovementService.apply({
      walletId,
      transactionId: input.reference,
      kind: 'credit',
      reason: 'deposit',
      amountSats: input.amountSats,
    });
  }
}
