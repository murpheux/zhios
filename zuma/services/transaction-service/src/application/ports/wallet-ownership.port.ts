// DEPRECATED / UNUSED: inferred ownership from the user-facing GET /wallets/:id, which privileged roles can
// read. Replaced by WalletServiceHttpClient (explicit check over /internal). Safe to delete.
// Confirms the caller owns a wallet before transaction-service acts on it, via wallet-service.
export interface WalletOwnershipPort {
  isOwner(walletId: string, ownerUserId: string, authorization?: string): Promise<boolean>;
}
