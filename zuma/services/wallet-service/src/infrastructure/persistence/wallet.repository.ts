import type { PaginatedResult, PaginationQuery } from '@zuma/shared-common';
import { toPaginatedResult } from '@zuma/shared-common';
import type { HydratedDocument } from 'mongoose';
import type { WalletEntity, NewWalletProps } from '../../domain/entities/wallet.entity';
import type {
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
  balanceCache: doc.balanceCache,
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
      balanceCache: '0',
      status: 'active',
    });
    return toEntity(doc);
  }

  async findById(id: string): Promise<WalletEntity | null> {
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
    const doc = await WalletModel.findByIdAndUpdate(
      id,
      { $set: changes },
      { new: true, runValidators: true },
    );
    return doc ? toEntity(doc) : null;
  }
}
