import type { PaginatedResult, PaginationQuery } from '@zuma/shared-common';
import { toPaginatedResult } from '@zuma/shared-common';
import type { HydratedDocument } from 'mongoose';
import type { NewTransactionProps, TransactionEntity } from '../../domain/entities/transaction.entity';
import type {
  TransactionFilter,
  TransactionRepositoryPort,
  TransactionUpdate,
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
  status: doc.status,
  confirmations: doc.confirmations,
  rawTx: doc.rawTx,
  broadcastAt: doc.broadcastAt,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

export class MongooseTransactionRepository implements TransactionRepositoryPort {
  async create(props: NewTransactionProps): Promise<TransactionEntity> {
    const doc = await TransactionModel.create({
      walletId: props.walletId,
      ownerUserId: props.ownerUserId,
      idempotencyKey: props.idempotencyKey ?? null,
      type: props.type,
      amount: props.amount,
      feeRate: props.feeRate,
      txid: null,
      rawTx: null,
      status: 'pending',
      confirmations: 0,
      broadcastAt: null,
    });
    return toEntity(doc);
  }

  async findByIdempotencyKey(ownerUserId: string, idempotencyKey: string): Promise<TransactionEntity | null> {
    const doc = await TransactionModel.findOne({ ownerUserId, idempotencyKey });
    return doc ? toEntity(doc) : null;
  }

  async findById(id: string): Promise<TransactionEntity | null> {
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

  async update(id: string, changes: TransactionUpdate): Promise<TransactionEntity | null> {
    const doc = await TransactionModel.findByIdAndUpdate(
      id,
      { $set: changes },
      { new: true, runValidators: true },
    );
    return doc ? toEntity(doc) : null;
  }

  // Atomic compare-and-swap: only applies the update if the document is still in `fromStatus`.
  // Returns null when another request already moved it out of that state (the race F3 exploited).
  async transition(
    id: string,
    fromStatus: TransactionDocumentShape['status'],
    changes: TransactionUpdate,
  ): Promise<TransactionEntity | null> {
    const doc = await TransactionModel.findOneAndUpdate(
      { _id: id, status: fromStatus },
      { $set: changes },
      { new: true, runValidators: true },
    );
    return doc ? toEntity(doc) : null;
  }
}
