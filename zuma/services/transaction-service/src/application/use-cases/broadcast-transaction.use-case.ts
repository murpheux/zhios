import { ConflictError, ForbiddenError, NotFoundError, isPrivileged, type Actor } from '@zuma/shared-common';
import { totalDebitSats, type TransactionEntity } from '../../domain/entities/transaction.entity';
import { formatSats } from '../../domain/value-objects/satoshi';
import type { TransactionRepositoryPort } from '../ports/transaction-repository.port';
import { BroadcastRejectedError, type BitcoinNodeClientPort } from '../ports/bitcoin-node-client.port';
import type { AuditLogRepositoryPort } from '../ports/audit-log-repository.port';
import type { SystemEventRepositoryPort } from '../ports/system-event-repository.port';
import type { WalletServicePort } from '../ports/wallet-service.port';

/**
 * pending --CAS--> broadcasting --(node ok)--> CAS --> broadcast(txid)
 *                              \--(node rejected)--> CAS --> failed + idempotent refund (by transactionId)
 *                              \--(unknown outcome, e.g. timeout)--> stays 'broadcasting', no refund
 *                                 (funds may already be on-chain); a system event flags it for reconciliation.
 */
export class BroadcastTransactionUseCase {
  constructor(
    private readonly transactionRepository: TransactionRepositoryPort,
    private readonly bitcoinNodeClient: BitcoinNodeClientPort,
    private readonly auditLogRepository: AuditLogRepositoryPort,
    private readonly walletService: WalletServicePort,
    private readonly systemEventRepository: SystemEventRepositoryPort,
  ) {}

  async execute(id: string, actor: Actor): Promise<TransactionEntity> {
    const transaction = await this.transactionRepository.findById(id);
    if (!transaction) {
      throw new NotFoundError('Transaction', id);
    }
    if (transaction.ownerUserId !== actor.sub) {
      // Strict owner for writes; privileged roles can read it so they get an explicit 403.
      if (isPrivileged(actor)) {
        throw new ForbiddenError('Only the transaction owner may broadcast it');
      }
      throw new NotFoundError('Transaction', id);
    }
    const rawTx = transaction.rawTx;
    if (transaction.status !== 'pending' || !rawTx || !transaction.debitedAt) {
      throw new ConflictError('Transaction is not in a valid state to be broadcast', 'INVALID_TRANSACTION_STATE');
    }

    const claimed = await this.transactionRepository.transition(id, 'pending', { status: 'broadcasting' });
    if (!claimed) {
      throw new ConflictError('Transaction is already being broadcast or was broadcast', 'BROADCAST_IN_PROGRESS');
    }

    let txid: string;
    try {
      ({ txid } = await this.bitcoinNodeClient.broadcast(rawTx));
    } catch (error) {
      if (error instanceof BroadcastRejectedError) {
        return this.failAndRefund(claimed, actor, error);
      }
      await this.systemEventRepository.record({
        eventType: 'transaction.broadcast_outcome_unknown',
        payload: { transactionId: id, walletId: transaction.walletId },
      });
      throw error;
    }

    const broadcast = await this.transactionRepository.transition(id, 'broadcasting', {
      status: 'broadcast',
      txid,
      broadcastAt: new Date(),
    });
    if (!broadcast) {
      await this.systemEventRepository.record({
        eventType: 'transaction.broadcast_state_lost',
        payload: { transactionId: id, txid },
      });
      throw new ConflictError('Transaction state changed during broadcast', 'BROADCAST_STATE_CONFLICT');
    }

    await this.auditLogRepository.create({
      actorUserId: actor.sub,
      action: 'transaction.broadcast',
      entityType: 'Transaction',
      entityId: id,
      metadata: { txid },
    });
    await this.systemEventRepository.record({
      eventType: 'transaction.broadcast',
      payload: { transactionId: id, walletId: transaction.walletId, txid },
    });
    return broadcast;
  }

  private async failAndRefund(
    transaction: TransactionEntity,
    actor: Actor,
    rejection: BroadcastRejectedError,
  ): Promise<never> {
    const failed = await this.transactionRepository.transition(transaction.id, 'broadcasting', {
      status: 'failed',
      failureReason: 'BROADCAST_REJECTED',
    });

    let refunded = false;
    if (failed) {
      try {
        const refund = await this.walletService.refund({
          walletId: transaction.walletId,
          transactionId: transaction.id,
          amountSats: formatSats(totalDebitSats(transaction)),
        });
        if (refund.ok) {
          refunded = true;
          await this.transactionRepository.transition(transaction.id, 'failed', { refundedAt: new Date() });
        } else {
          await this.systemEventRepository.record({
            eventType: 'wallet.refund_rejected',
            payload: { transactionId: transaction.id, walletId: transaction.walletId, code: refund.code },
          });
        }
      } catch {
        // Refund is idempotent by transactionId; a reconciler can retry failed+debited+!refundedAt records.
        await this.systemEventRepository.record({
          eventType: 'wallet.refund_pending',
          payload: { transactionId: transaction.id, walletId: transaction.walletId },
        });
      }
    }

    await this.auditLogRepository.create({
      actorUserId: actor.sub,
      action: 'transaction.broadcast_failed',
      entityType: 'Transaction',
      entityId: transaction.id,
      metadata: { reason: rejection.message, refunded },
    });
    await this.systemEventRepository.record({
      eventType: 'transaction.broadcast_failed',
      payload: { transactionId: transaction.id, walletId: transaction.walletId, refunded },
    });
    throw new ConflictError(
      refunded
        ? 'The Bitcoin node rejected the transaction; funds were returned to the wallet'
        : 'The Bitcoin node rejected the transaction; the refund is pending',
      'BROADCAST_FAILED',
    );
  }
}
