import { ConflictError, ForbiddenError, ValidationError, type Actor } from '@zuma/shared-common';
import { totalDebitSats, type TransactionEntity } from '../../domain/entities/transaction.entity';
import type { BitcoinNetwork, TransactionKind } from '../../domain/value-objects/transaction-status';
import { formatSats, parseFeeRate, parseSatsAmount } from '../../domain/value-objects/satoshi';
import { isValidAddressForNetwork } from '../../domain/value-objects/bitcoin-address';
import {
  DuplicateIdempotencyKeyError,
  type TransactionRepositoryPort,
} from '../ports/transaction-repository.port';
import type { BitcoinNodeClientPort } from '../ports/bitcoin-node-client.port';
import type { AuditLogRepositoryPort } from '../ports/audit-log-repository.port';
import type { WalletServicePort } from '../ports/wallet-service.port';

export interface CreateTransactionInput {
  walletId: string;
  type: TransactionKind;
  amount: string;
  feeRate: string;
  destinationAddress: string;
  idempotencyKey?: string;
}

export const IDEMPOTENCY_KEY_PATTERN = '^[A-Za-z0-9._:-]{8,128}$';
const IDEMPOTENCY_KEY_REGEX = new RegExp(IDEMPOTENCY_KEY_PATTERN);

// Debit rejections that are persisted as failureReason and re-raised (409) on idempotent replay.
const DEBIT_REJECTION_CODES = new Set(['INSUFFICIENT_FUNDS', 'WALLET_NOT_ACTIVE', 'WALLET_NOT_FOUND']);

/**
 * Flow: validate -> idempotent replay check -> strict wallet ownership/status/network -> build + sign ->
 * single insert (status 'pending', rawTx + destination) -> debit amount+fee in wallet-service with
 * transactionId = new tx id -> mark debitedAt. A definitive debit rejection marks the tx 'failed' and
 * surfaces 409. A transport failure leaves it 'pending' without debitedAt; replaying the same
 * Idempotency-Key resumes the (idempotent) debit, and broadcast refuses until debitedAt is set.
 */
export class CreateTransactionUseCase {
  constructor(
    private readonly transactionRepository: TransactionRepositoryPort,
    private readonly bitcoinNodeClient: BitcoinNodeClientPort,
    private readonly auditLogRepository: AuditLogRepositoryPort,
    private readonly walletService: WalletServicePort,
    /** The network this service's Bitcoin node is attached to (BITCOIN_NETWORK). */
    private readonly nodeNetwork: BitcoinNetwork,
  ) {}

  async execute(input: CreateTransactionInput, actor: Actor): Promise<TransactionEntity> {
    const idempotencyKey = input.idempotencyKey;
    if (!idempotencyKey || !IDEMPOTENCY_KEY_REGEX.test(idempotencyKey)) {
      throw new ValidationError('Idempotency-Key header is required (8-128 chars of [A-Za-z0-9._:-])');
    }
    if (input.type !== 'send') {
      throw new ValidationError("Only 'send' transactions can be created via the API");
    }
    const amountSats = parseSatsAmount(input.amount);
    if (amountSats === null) {
      throw new ValidationError('amount must be a positive integer number of satoshis within max supply');
    }
    const feeRate = parseFeeRate(input.feeRate);
    if (feeRate === null) {
      throw new ValidationError('feeRate must be an integer between 1 and 10000 sat/vB');
    }

    const existing = await this.transactionRepository.findByIdempotencyKey(actor.sub, idempotencyKey);
    if (existing) {
      return this.replay(existing, input, actor);
    }

    const wallet = await this.walletService.getWallet(input.walletId);
    // Strict ownership for writes: admin/auditor read access does not extend to spending. Missing and
    // not-owned look identical so wallet existence isn't confirmed to non-owners.
    if (!wallet || wallet.ownerUserId !== actor.sub) {
      throw new ForbiddenError('Wallet does not belong to the caller');
    }
    if (wallet.status !== 'active') {
      throw new ConflictError(`Wallet is ${wallet.status} and cannot send`, 'WALLET_NOT_ACTIVE');
    }
    if (wallet.network !== this.nodeNetwork) {
      throw new ConflictError(
        `Wallet network '${wallet.network}' does not match this service's node network`,
        'NETWORK_MISMATCH',
      );
    }
    if (!isValidAddressForNetwork(input.destinationAddress, wallet.network)) {
      throw new ValidationError(`destinationAddress is not a valid ${wallet.network} address`);
    }

    const built = await this.bitcoinNodeClient.build({
      walletId: input.walletId,
      network: wallet.network,
      amountSats,
      feeRate,
      destinationAddress: input.destinationAddress,
    });
    if (!Number.isSafeInteger(built.feeSats) || built.feeSats < 0) {
      throw new Error('Bitcoin node returned an invalid fee');
    }
    const signed = await this.bitcoinNodeClient.sign(built.rawTx);

    let created: TransactionEntity;
    try {
      created = await this.transactionRepository.create({
        walletId: input.walletId,
        ownerUserId: actor.sub,
        idempotencyKey,
        type: 'send',
        amount: formatSats(amountSats),
        feeRate: String(feeRate),
        feeSats: formatSats(built.feeSats),
        destinationAddress: input.destinationAddress,
        rawTx: signed.rawTx,
      });
    } catch (error) {
      if (error instanceof DuplicateIdempotencyKeyError) {
        // Lost a concurrent-duplicate race on the unique index: the winner's record is the answer.
        const winner = await this.transactionRepository.findByIdempotencyKey(actor.sub, idempotencyKey);
        if (winner) {
          return this.replay(winner, input, actor);
        }
      }
      throw error;
    }

    await this.auditLogRepository.create({
      actorUserId: actor.sub,
      action: 'transaction.created',
      entityType: 'Transaction',
      entityId: created.id,
      metadata: { walletId: input.walletId, type: 'send', amount: created.amount, feeSats: created.feeSats },
    });

    return this.reserveFunds(created, actor);
  }

  private async replay(
    existing: TransactionEntity,
    input: CreateTransactionInput,
    actor: Actor,
  ): Promise<TransactionEntity> {
    const sameRequest =
      existing.walletId === input.walletId &&
      existing.type === input.type &&
      existing.amount === input.amount &&
      existing.feeRate === input.feeRate &&
      existing.destinationAddress === input.destinationAddress;
    if (!sameRequest) {
      throw new ConflictError(
        'Idempotency-Key was already used with a different request body',
        'IDEMPOTENCY_CONFLICT',
      );
    }
    if (existing.status === 'failed' && existing.failureReason && DEBIT_REJECTION_CODES.has(existing.failureReason)) {
      throw new ConflictError('Transaction failed: wallet debit was rejected', existing.failureReason);
    }
    if (existing.status === 'pending' && !existing.debitedAt) {
      return this.reserveFunds(existing, actor);
    }
    return existing;
  }

  private async reserveFunds(transaction: TransactionEntity, actor: Actor): Promise<TransactionEntity> {
    const result = await this.walletService.debit({
      walletId: transaction.walletId,
      transactionId: transaction.id,
      amountSats: formatSats(totalDebitSats(transaction)),
    });

    if (result.ok) {
      const reserved = await this.transactionRepository.transition(transaction.id, 'pending', {
        debitedAt: new Date(),
      });
      return reserved ?? (await this.transactionRepository.findById(transaction.id)) ?? transaction;
    }

    await this.transactionRepository.transition(transaction.id, 'pending', {
      status: 'failed',
      failureReason: result.code,
    });
    await this.auditLogRepository.create({
      actorUserId: actor.sub,
      action: 'transaction.debit_rejected',
      entityType: 'Transaction',
      entityId: transaction.id,
      metadata: { walletId: transaction.walletId, code: result.code },
    });
    throw new ConflictError(result.message, result.code);
  }
}
