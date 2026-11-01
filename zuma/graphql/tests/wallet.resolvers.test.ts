import { walletResolvers } from '../src/resolvers/wallet.resolvers';
import type { WalletServiceClient } from '../src/clients/wallet-service.client';
import { UpstreamHttpError } from '../src/clients/upstream-http-error';
import type { GatewayContext } from '../src/context';
import type { WalletDto } from '@zuma/shared-common';

const buildWallet = (overrides: Partial<WalletDto> = {}): WalletDto => ({
  id: 'a'.repeat(24),
  label: 'My Wallet',
  address: 'tb1qmockaddress',
  network: 'testnet',
  type: 'non-custodial',
  balanceCache: '0',
  metadata: {},
  ownerUserId: 'user-1',
  status: 'active',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

const buildCtx = (client: Partial<jest.Mocked<WalletServiceClient>>): GatewayContext => ({
  walletServiceClient: client as unknown as WalletServiceClient,
  transactionServiceClient: {} as GatewayContext['transactionServiceClient'],
  authorization: 'Bearer test-token',
});

describe('walletResolvers', () => {
  it('wallet: forwards the bearer token and maps enums to GraphQL values', async () => {
    const wallet = buildWallet();
    const getWallet = jest.fn().mockResolvedValue(wallet);
    const result = await walletResolvers.Query.wallet(undefined, { id: wallet.id }, buildCtx({ getWallet }));

    expect(getWallet).toHaveBeenCalledWith(wallet.id, 'Bearer test-token');
    expect(result).toMatchObject({ network: 'TESTNET', type: 'NON_CUSTODIAL', status: 'ACTIVE', balanceCache: '0' });
  });

  it('createWallet: maps GraphQL enums to REST values and never sends ownerUserId', async () => {
    const createWallet = jest.fn().mockResolvedValue(buildWallet());
    await walletResolvers.Mutation.createWallet(
      undefined,
      { input: { label: 'L', network: 'TESTNET', type: 'NON_CUSTODIAL' } },
      buildCtx({ createWallet }),
    );
    expect(createWallet).toHaveBeenCalledWith(
      { label: 'L', network: 'testnet', type: 'non-custodial' },
      'Bearer test-token',
    );
  });

  it('updateWalletMetadata: calls the client with only provided fields', async () => {
    const updateWalletMetadata = jest.fn().mockResolvedValue(buildWallet({ label: 'New' }));
    const result = await walletResolvers.Mutation.updateWalletMetadata(
      undefined,
      { id: 'w1', input: { label: 'New' } },
      buildCtx({ updateWalletMetadata }),
    );
    expect(updateWalletMetadata).toHaveBeenCalledWith('w1', { label: 'New' }, 'Bearer test-token');
    expect(result.label).toBe('New');
  });

  it('maps upstream errors to GraphQL errors with extensions.code', async () => {
    const getWallet = jest.fn().mockRejectedValue(new UpstreamHttpError(404, 'NOT_FOUND', 'Wallet not found'));
    await expect(walletResolvers.Query.wallet(undefined, { id: 'x' }, buildCtx({ getWallet }))).rejects.toMatchObject({
      message: 'Wallet not found',
      extensions: { code: 'NOT_FOUND', statusCode: 404 },
    });
  });

  it('hides unexpected error details', async () => {
    const getWallet = jest.fn().mockRejectedValue(new Error('ECONNRESET 10.0.0.5:3001'));
    await expect(walletResolvers.Query.wallet(undefined, { id: 'x' }, buildCtx({ getWallet }))).rejects.toMatchObject({
      message: 'Internal server error',
      extensions: { code: 'INTERNAL_ERROR' },
    });
  });
});
