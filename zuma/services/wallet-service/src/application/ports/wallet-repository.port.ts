import type { PaginatedResult, PaginationQuery } from '@zuma/shared-common';
import type { WalletEntity, NewWalletProps } from '../../domain/entities/wallet.entity';

export interface WalletFilter {
  ownerUserId?: string;
}

// Repository port implemented by the infrastructure layer (Mongoose, in-memory, etc).
export interface WalletRepositoryPort {
  create(props: NewWalletProps): Promise<WalletEntity>;
  findById(id: string): Promise<WalletEntity | null>;
  findMany(filter: WalletFilter, pagination: PaginationQuery): Promise<PaginatedResult<WalletEntity>>;
  updateMetadata(
    id: string,
    changes: { label?: string; metadata?: Record<string, unknown> },
  ): Promise<WalletEntity | null>;
}
