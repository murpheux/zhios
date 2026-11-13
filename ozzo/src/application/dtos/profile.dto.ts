import type { BankAccountDto } from './bank-account.dto';
import type { UserDto } from './user.dto';
import type { ZumaWallet } from '../ports/zuma-client';

export interface UserProfileDto extends UserDto {
  accounts: BankAccountDto[];
  totalBalance: string;
}

export interface WalletSyncDto {
  userId: string;
  wallets: ZumaWallet[];
  fetchedAt: string;
  /** True when served from Redis within the TTL. */
  cached: boolean;
}
