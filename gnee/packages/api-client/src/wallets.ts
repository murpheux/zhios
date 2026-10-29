import type { ZumaClient } from "./client";
import type { CreateWalletInput, ListWalletsParams, Wallet, WalletConnection } from "./types";

const WALLET_FIELDS = /* GraphQL */ `
  id
  label
  address
  network
  type
  balanceCache
  metadata
  ownerUserId
  status
  createdAt
  updatedAt
`;

const GET_WALLET = /* GraphQL */ `
  query Wallet($id: ID!) {
    wallet(id: $id) { ${WALLET_FIELDS} }
  }
`;

const LIST_WALLETS = /* GraphQL */ `
  query Wallets($page: Int, $limit: Int, $ownerUserId: String) {
    wallets(page: $page, limit: $limit, ownerUserId: $ownerUserId) {
      items { ${WALLET_FIELDS} }
      pageInfo { total page limit totalPages }
    }
  }
`;

const CREATE_WALLET = /* GraphQL */ `
  mutation CreateWallet($input: CreateWalletInput!) {
    createWallet(input: $input) { ${WALLET_FIELDS} }
  }
`;

export function createWalletsApi(client: ZumaClient) {
  return {
    get(id: string) {
      return client
        .request<{ wallet: Wallet | null }, { id: string }>(GET_WALLET, { id })
        .then((d) => d.wallet);
    },
    list(params: ListWalletsParams = {}) {
      return client
        .request<{ wallets: WalletConnection }, ListWalletsParams>(LIST_WALLETS, params)
        .then((d) => d.wallets);
    },
    create(input: CreateWalletInput) {
      return client
        .request<{ createWallet: Wallet }, { input: CreateWalletInput }>(CREATE_WALLET, { input })
        .then((d) => d.createWallet);
    },
  };
}

export type WalletsApi = ReturnType<typeof createWalletsApi>;
