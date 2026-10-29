import { walletResolvers } from '../src/resolvers/wallet.resolvers';
import type { WalletServiceClient } from '../src/clients/wallet-service.client';
import type { GatewayContext } from '../src/context';
import type { WalletDto } from '@zuma/shared-common';

describe('walletResolvers.Query.wallet', () => {
  const buildWallet = (overrides: Partial<WalletDto> = {}): WalletDto => ({
    id: 'wallet-1',
    label: 'My Wallet',
    address: 'tb1qmockaddress',
    network: 'testnet',
    type: 'hot',
    balanceCache: '0',
    metadata: {},
    ownerUserId: 'user-1',
    status: 'active',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  });

  it('forwards the bearer token and returns the upstream wallet shape', async () => {
    const wallet = buildWallet();
    const walletServiceClient = {
      getWallet: jest.fn().mockResolvedValue(wallet),
      listWallets: jest.fn(),
      createWallet: jest.fn(),
      updateWalletMetadata: jest.fn(),
    } as unknown as jest.Mocked<WalletServiceClient>;

    const ctx: GatewayContext = {
      walletServiceClient,
      transactionServiceClient: {} as GatewayContext['transactionServiceClient'],
      authorization: 'Bearer test-token',
    };

    const result = await walletResolvers.Query.wallet(undefined, { id: 'wallet-1' }, ctx);

    expect(walletServiceClient.getWallet).toHaveBeenCalledWith('wallet-1', 'Bearer test-token');
    expect(result).toEqual(wallet);
  });
});
