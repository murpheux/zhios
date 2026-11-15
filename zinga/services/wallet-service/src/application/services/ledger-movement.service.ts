import { ConflictError, NotFoundError, ValidationError } from '@zinga/shared-common';
import type { LedgerEntryKind, LedgerEntryReason } from '../../domain/entities/ledger-entry.entity';
import { formatSats, parseSatsAmount } from '../../domain/value-objects/satoshi';
import type { LedgerRepositoryPort } from '../ports/ledger-repository.port';
import type { WalletRepositoryPort } from '../ports/wallet-repository.port';

export interface LedgerMovementRequest {
  walletId: string;
  transactionId: string;
  kind: LedgerEntryKind;
  reason: LedgerEntryReason;
  /** Decimal satoshi string from the wire; validated here as a positive safe integer <= max supply. */
  amountSats: string;
}

export interface WalletBalanceResult {
  walletId: string;
  balanceCache: string;
}

/**
 * Applies one idempotent balance movement without a multi-document transaction (works on a standalone
 * mongod; the k8s StatefulSet is not a replica set). Ordering — each step is safe to crash after:
 *
 *  1. insert ledger entry (state 'pending'); the unique (transactionId, kind, reason) index makes a
 *     replay find the existing entry instead of creating a second one.
 *  2. one guarded findOneAndUpdate on the wallet: status/balance guards + `pendingLedgerIds != entryId`,
 *     `$inc` the balance and `$push` entryId in the same atomic write — so a resumed replay can never
 *     apply the same entry twice (classic MongoDB two-phase "pending transactions" pattern).
 *  3. mark the ledger entry 'applied' with balanceAfterSats (the original result for replays).
 *  4. `$pull` entryId from the wallet's pending list.
 *
 * If step 2's guard rejects the movement, the pending entry is deleted (compensation) and a 404/409 is
 * raised; a later retry with the same transactionId is evaluated afresh.
 */
export class LedgerMovementService {
  constructor(
    private readonly walletRepository: WalletRepositoryPort,
    private readonly ledgerRepository: LedgerRepositoryPort,
  ) {}

  async apply(request: LedgerMovementRequest): Promise<WalletBalanceResult> {
    const amountSats = parseSatsAmount(request.amountSats);
    if (amountSats === null) {
      throw new ValidationError('amountSats must be a positive integer number of satoshis within max supply');
    }

    const { entry, inserted } = await this.ledgerRepository.insertPending({
      walletId: request.walletId,
      transactionId: request.transactionId,
      kind: request.kind,
      reason: request.reason,
      amountSats,
    });

    if (!inserted) {
      if (entry.walletId !== request.walletId || entry.amountSats !== amountSats) {
        throw new ConflictError(
          `A ${request.kind} for transaction '${request.transactionId}' already exists with different parameters`,
          'IDEMPOTENCY_CONFLICT',
        );
      }
      if (entry.state === 'applied' && entry.balanceAfterSats !== null) {
        // Replay of a completed movement: return the original result, and finish step 4 in case it was lost.
        await this.walletRepository.clearPendingMovement(request.walletId, entry.id);
        return { walletId: request.walletId, balanceCache: formatSats(entry.balanceAfterSats) };
      }
      // Still pending: a previous attempt crashed or is in flight — resume from step 2 (guarded, so safe).
    }

    const result = await this.walletRepository.applyBalanceMovement({
      walletId: request.walletId,
      movementId: entry.id,
      deltaSats: request.kind === 'debit' ? -amountSats : amountSats,
      requireActive: request.kind === 'debit',
    });

    switch (result.outcome) {
      case 'applied':
      case 'already-applied': {
        await this.ledgerRepository.markApplied(entry, result.wallet.balanceSats);
        await this.walletRepository.clearPendingMovement(request.walletId, entry.id);
        return { walletId: request.walletId, balanceCache: formatSats(result.wallet.balanceSats) };
      }
      case 'not-found':
        return this.rejectUnlessCompleted(request, entry.id, new NotFoundError('Wallet', request.walletId));
      case 'not-active':
        return this.rejectUnlessCompleted(
          request,
          entry.id,
          new ConflictError(`Wallet is ${result.wallet.status} and cannot be debited`, 'WALLET_NOT_ACTIVE'),
        );
      case 'insufficient-funds':
        return this.rejectUnlessCompleted(
          request,
          entry.id,
          new ConflictError('Wallet balance is insufficient for this debit', 'INSUFFICIENT_FUNDS'),
        );
    }
  }

  // A concurrent attempt for the same transactionId may have completed (and $pull-ed its marker) between
  // our guarded write and the classification read; if so this is a replay, not a failure.
  private async rejectUnlessCompleted(
    request: LedgerMovementRequest,
    entryId: string,
    error: Error,
  ): Promise<WalletBalanceResult> {
    const latest = await this.ledgerRepository.findByKey(request.transactionId, request.kind, request.reason);
    if (latest?.state === 'applied' && latest.balanceAfterSats !== null) {
      return { walletId: request.walletId, balanceCache: formatSats(latest.balanceAfterSats) };
    }
    await this.ledgerRepository.deletePending(entryId);
    throw error;
  }
}
