import { ForbiddenError, type Actor } from '@zuma/shared-common';
import type { TransactionEntity } from '../../domain/entities/transaction.entity';
import type { TransactionKind } from '../../domain/value-objects/transaction-status';
import type { TransactionRepositoryPort } from '../ports/transaction-repository.port';
import type { BitcoinNodeClientPort } from '../ports/bitcoin-node-client.port';
import type { AuditLogRepositoryPort } from '../ports/audit-log-repository.port';
import type { WalletOwnershipPort } from '../ports/wallet-ownership.port';

export interface CreateTransactionInput {
  walletId: string;
  type: TransactionKind;
  amount: string;
  feeRate: string;
  destinationAddress: string;
  idempotencyKey?: string;
}

export class CreateTransactionUseCase {
  constructor(
    private readonly transactionRepository: TransactionRepositoryPort,
    private readonly bitcoinNodeClient: BitcoinNodeClientPort,
    private readonly auditLogRepository: AuditLogRepositoryPort,
    private readonly walletOwnershipPort: WalletOwnershipPort,
  ) {}

  async execute(input: CreateTransactionInput, actor: Actor, authorization?: string): Promise<TransactionEntity> {
    // Idempotent replay: the same caller retrying with the same key gets back the original transaction.
    if (input.idempotencyKey) {
      const existing = await this.transactionRepository.findByIdempotencyKey(actor.sub, input.idempotencyKey);
      if (existing) {
        return existing;
      }
    }

    const owns = await this.walletOwnershipPort.isOwner(input.walletId, actor.sub, authorization);
    if (!owns) {
      throw new ForbiddenError('Wallet does not belong to the caller');
    }

    const built = await this.bitcoinNodeClient.build({
      walletId: input.walletId,
      amount: input.amount,
      feeRate: input.feeRate,
      destinationAddress: input.destinationAddress,
    });
    const signed = await this.bitcoinNodeClient.sign(built.rawTx);

    const created = await this.transactionRepository.create({
      walletId: input.walletId,
      ownerUserId: actor.sub,
      idempotencyKey: input.idempotencyKey,
      type: input.type,
      amount: input.amount,
      feeRate: input.feeRate,
    });
    const transaction = await this.transactionRepository.update(created.id, { rawTx: signed.rawTx });

    await this.auditLogRepository.create({
      actorUserId: actor.sub,
      action: 'transaction.created',
      entityType: 'Transaction',
      entityId: created.id,
      metadata: { walletId: input.walletId, type: input.type },
    });

    return transaction ?? created;
  }
}
