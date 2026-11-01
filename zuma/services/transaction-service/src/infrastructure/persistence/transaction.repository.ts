import type { PaginatedResult, PaginationQuery } from '@zuma/shared-common';
import { toPaginatedResult } from '@zuma/shared-common';
import { isValidObjectId, type HydratedDocument } from 'mongoose';
import type { NewTransactionProps, TransactionEntity } from '../../domain/entities/transaction.entity';
import {
  DuplicateIdempotencyKeyError,
  type TransactionFilter,
  type TransactionRepositoryPort,
  type TransactionUpdate,
} from '../../application/ports/transaction-repository.port';
import { TransactionModel } from './mongoose/transaction.model';
import type { TransactionDocumentShape } from './mongoose/transaction.schema';

const toEntity = (doc: HydratedDocument<TransactionDocumentShape>): TransactionEntity => ({
  id: doc.id as string,
  walletId: doc.walletId,
  ownerUserId: doc.ownerUserId,
  idempotencyKey: doc.idempotencyKey,
  txid: doc.txid,
  type: doc.type,
  amount: doc.amount,
  feeRate: doc.feeRate,
  feeSats: doc.feeSats ?? '0',
  destinationAddress: doc.destinationAddress,
  status: doc.status,
  failureReason: doc.failureReason ?? null,
  confirmations: doc.confirmations,
  rawTx: doc.rawTx,
  debitedAt: doc.debitedAt ?? null,
  refundedAt: doc.refundedAt ?? null,
  broadcastAt: doc.broadcastAt,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000;

export class MongooseTransactionRepository implements TransactionRepositoryPort {
  async create(props: NewTransactionProps): Promise<TransactionEntity> {
    try {
      // One insert carrying rawTx + destination: there is no window where a pending tx lacks its payload.
      const doc = await TransactionModel.create({
        ...props,
        txid: null,
        status: 'pending',
        failureReason: null,
        confirmations: 0,
        debitedAt: null,
        refundedAt: null,
        broadcastAt: null,
      });
      return toEntity(doc);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new DuplicateIdempotencyKeyError(props.ownerUserId, props.idempotencyKey);
      }
      throw error;
    }
  }

  async findByIdempotencyKey(ownerUserId: string, idempotencyKey: string): Promise<TransactionEntity | null> {
    const doc = await TransactionModel.findOne({ ownerUserId, idempotencyKey });
    return doc ? toEntity(doc) : null;
  }

  async findById(id: string): Promise<TransactionEntity | null> {
    if (!isValidObjectId(id)) {
      return null;
    }
    const doc = await TransactionModel.findById(id);
    return doc ? toEntity(doc) : null;
  }

  async findMany(
    filter: TransactionFilter,
    pagination: PaginationQuery,
  ): Promise<PaginatedResult<TransactionEntity>> {
    const query: Record<string, unknown> = {};
    if (filter.ownerUserId) {
      query.ownerUserId = filter.ownerUserId;
    }
    if (filter.walletId) {
      query.walletId = filter.walletId;
    }
    if (filter.status) {
      query.status = filter.status;
    }
    if (filter.dateFrom || filter.dateTo) {
      query.createdAt = {
        ...(filter.dateFrom ? { $gte: filter.dateFrom } : {}),
        ...(filter.dateTo ? { $lte: filter.dateTo } : {}),
      };
    }

    const skip = (pagination.page - 1) * pagination.limit;
    const [docs, total] = await Promise.all([
      TransactionModel.find(query).skip(skip).limit(pagination.limit).sort({ createdAt: -1 }),
      TransactionModel.countDocuments(query),
    ]);

    return toPaginatedResult(docs.map(toEntity), total, pagination);
  }

  // Atomic compare-and-swap: only applies the update if the document is still in `fromStatus`.
  // Returns null when another request already moved it out of that state.
  async transition(
    id: string,
    fromStatus: TransactionDocumentShape['status'],
    changes: TransactionUpdate,
  ): Promise<TransactionEntity | null> {
    if (!isValidObjectId(id)) {
      return null;
    }
    const doc = await TransactionModel.findOneAndUpdate(
      { _id: id, status: fromStatus },
      { $set: changes },
      { new: true, runValidators: true },
    );
    return doc ? toEntity(doc) : null;
  }
}
