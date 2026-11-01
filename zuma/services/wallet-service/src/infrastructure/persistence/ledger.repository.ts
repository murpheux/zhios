import { isValidObjectId, type HydratedDocument } from 'mongoose';
import type {
  LedgerEntryEntity,
  LedgerEntryKind,
  LedgerEntryReason,
  NewLedgerEntryProps,
} from '../../domain/entities/ledger-entry.entity';
import type { LedgerInsertResult, LedgerRepositoryPort } from '../../application/ports/ledger-repository.port';
import { LedgerEntryModel } from './mongoose/ledger-entry.model';
import type { LedgerEntryDocumentShape } from './mongoose/ledger-entry.schema';
import { isDuplicateKeyError } from './mongo-errors';

const toEntity = (doc: HydratedDocument<LedgerEntryDocumentShape>): LedgerEntryEntity => ({
  id: doc.id as string,
  walletId: doc.walletId,
  transactionId: doc.transactionId,
  kind: doc.kind,
  reason: doc.reason,
  amountSats: doc.amountSats,
  state: doc.state,
  balanceAfterSats: doc.balanceAfterSats ?? null,
  createdAt: doc.createdAt,
});

export class MongooseLedgerRepository implements LedgerRepositoryPort {
  async insertPending(props: NewLedgerEntryProps): Promise<LedgerInsertResult> {
    try {
      const doc = await LedgerEntryModel.create({ ...props, state: 'pending', balanceAfterSats: null });
      return { entry: toEntity(doc), inserted: true };
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
      // Lost the race (or a replay): the unique index guarantees exactly one entry; return it.
      const existing = await this.findByKey(props.transactionId, props.kind, props.reason);
      if (!existing) {
        throw error;
      }
      return { entry: existing, inserted: false };
    }
  }

  async markApplied(entry: LedgerEntryEntity, balanceAfterSats: number): Promise<void> {
    // Upsert so the audit record survives even if a concurrent failed attempt compensated (deleted) the
    // pending entry after this attempt's balance write had already landed.
    await LedgerEntryModel.updateOne(
      { _id: entry.id },
      {
        $set: { state: 'applied', balanceAfterSats },
        $setOnInsert: {
          walletId: entry.walletId,
          transactionId: entry.transactionId,
          kind: entry.kind,
          reason: entry.reason,
          amountSats: entry.amountSats,
          createdAt: entry.createdAt,
        },
      },
      { upsert: true },
    );
  }

  async deletePending(id: string): Promise<void> {
    if (!isValidObjectId(id)) {
      return;
    }
    await LedgerEntryModel.deleteOne({ _id: id, state: 'pending' });
  }

  async findByKey(
    transactionId: string,
    kind: LedgerEntryKind,
    reason: LedgerEntryReason,
  ): Promise<LedgerEntryEntity | null> {
    const doc = await LedgerEntryModel.findOne({ transactionId, kind, reason });
    return doc ? toEntity(doc) : null;
  }
}
