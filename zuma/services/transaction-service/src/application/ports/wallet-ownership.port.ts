// Confirms the caller owns a wallet before transaction-service acts on it, via wallet-service.
export interface WalletOwnershipPort {
  isOwner(walletId: string, ownerUserId: string, authorization?: string): Promise<boolean>;
}
