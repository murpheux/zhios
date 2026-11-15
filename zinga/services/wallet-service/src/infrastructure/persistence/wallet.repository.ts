import type { PaginatedResult, PaginationQuery } from '@zinga/shared-common';
import { toPaginatedResult } from '@zinga/shared-common';
import { isValidObjectId, type HydratedDocument } from 'mongoose';
import type { WalletEntity, NewWalletProps } from '../../domain/entities/wallet.entity';
import type {
  BalanceMovement,
  BalanceMovementResult,
  WalletFilter,
  WalletRepositoryPort,
} from '../../application/ports/wallet-repository.port';
import { WalletModel } from './mongoose/wallet.model';
import type { WalletDocumentShape } from './mongoose/wallet.schema';

const toEntity = (doc: HydratedDocument<WalletDocumentShape>): WalletEntity => ({
  id: doc.id as string,
  label: doc.label,
  address: doc.address,
  network: doc.network,
  type: doc.type,
  balanceSats: doc.balanceSats ?? 0,
  metadata: doc.metadata,
  ownerUserId: doc.ownerUserId,
  status: doc.status,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

export class MongooseWalletRepository implements WalletRepositoryPort {
  async create(props: NewWalletProps): Promise<WalletEntity> {
    const doc = await WalletModel.create({
      label: props.label,
      address: props.address,
      network: props.network,
      type: props.type,
      ownerUserId: props.ownerUserId,
      metadata: props.metadata ?? {},
      balanceSats: 0,
      pendingLedgerIds: [],
      status: 'active',
    });
    return toEntity(doc);
  }

  async findById(id: string): Promise<WalletEntity | null> {
    if (!isValidObjectId(id)) {
      return null;
    }
    const doc = await WalletModel.findById(id);
    return doc ? toEntity(doc) : null;
  }

  async findMany(
    filter: WalletFilter,
    pagination: PaginationQuery,
  ): Promise<PaginatedResult<WalletEntity>> {
    const query: Record<string, unknown> = {};
    if (filter.ownerUserId) {
      query.ownerUserId = filter.ownerUserId;
    }

    const skip = (pagination.page - 1) * pagination.limit;
    const [docs, total] = await Promise.all([
      WalletModel.find(query).skip(skip).limit(pagination.limit).sort({ createdAt: -1 }),
      WalletModel.countDocuments(query),
    ]);

    return toPaginatedResult(docs.map(toEntity), total, pagination);
  }

  async updateMetadata(
    id: string,
    changes: { label?: string; metadata?: Record<string, unknown> },
  ): Promise<WalletEntity | null> {
    if (!isValidObjectId(id)) {
      return null;
    }
    // Only label/metadata are ever $set here — balance/status can't be smuggled in via this path.
    const $set: Record<string, unknown> = {};
    if (changes.label !== undefined) {
      $set.label = changes.label;
    }
    if (changes.metadata !== undefined) {
      $set.metadata = changes.metadata;
    }
    const doc = await WalletModel.findByIdAndUpdate(id, { $set }, { new: true, runValidators: true });
    return doc ? toEntity(doc) : null;
  }

  async applyBalanceMovement(movement: BalanceMovement): Promise<BalanceMovementResult> {
    if (!isValidObjectId(movement.walletId)) {
      return { outcome: 'not-found' };
    }
    const guard: Record<string, unknown> = {
      _id: movement.walletId,
      pendingLedgerIds: { $ne: movement.movementId },
    };
    if (movement.requireActive) {
      guard.status = 'active';
    }
    if (movement.deltaSats < 0) {
      // Atomic overdraft guard: the $inc only happens if the balance covers it at write time.
      guard.balanceSats = { $gte: -movement.deltaSats };
    }

    const doc = await WalletModel.findOneAndUpdate(
      guard,
      { $inc: { balanceSats: movement.deltaSats }, $push: { pendingLedgerIds: movement.movementId } },
      { new: true },
    );
    if (doc) {
      return { outcome: 'applied', wallet: toEntity(doc) };
    }

    // Guard rejected the write: classify why with a plain read (no write follows from this read).
    const current = await WalletModel.findById(movement.walletId);
    if (!current) {
      return { outcome: 'not-found' };
    }
    const wallet = toEntity(current);
    if ((current.pendingLedgerIds ?? []).includes(movement.movementId)) {
      return { outcome: 'already-applied', wallet };
    }
    if (movement.requireActive && current.status !== 'active') {
      return { outcome: 'not-active', wallet };
    }
    return { outcome: 'insufficient-funds', wallet };
  }

  async clearPendingMovement(walletId: string, movementId: string): Promise<void> {
    if (!isValidObjectId(walletId)) {
      return;
    }
    await WalletModel.updateOne({ _id: walletId }, { $pull: { pendingLedgerIds: movementId } });
  }
}
