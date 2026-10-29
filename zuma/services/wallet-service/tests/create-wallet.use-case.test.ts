import { CreateWalletUseCase } from '../src/application/use-cases/create-wallet.use-case';
import type { WalletRepositoryPort } from '../src/application/ports/wallet-repository.port';
import type { AddressGeneratorPort } from '../src/application/ports/address-generator.port';
import type { WalletEntity } from '../src/domain/entities/wallet.entity';

describe('CreateWalletUseCase', () => {
  const buildWallet = (overrides: Partial<WalletEntity> = {}): WalletEntity => ({
    id: 'wallet-1',
    label: 'My Wallet',
    address: 'tb1qmockaddress',
    network: 'testnet',
    type: 'hot',
    balanceCache: '0',
    metadata: {},
    ownerUserId: 'user-1',
    status: 'active',
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    ...overrides,
  });

  it('generates an address and persists the new wallet', async () => {
    const created = buildWallet();
    const walletRepository: jest.Mocked<WalletRepositoryPort> = {
      create: jest.fn().mockResolvedValue(created),
      findById: jest.fn(),
      findMany: jest.fn(),
      updateMetadata: jest.fn(),
    };
    const addressGenerator: jest.Mocked<AddressGeneratorPort> = {
      generate: jest.fn().mockResolvedValue('tb1qmockaddress'),
    };

    const useCase = new CreateWalletUseCase(walletRepository, addressGenerator);
    const result = await useCase.execute(
      {
        label: 'My Wallet',
        network: 'testnet',
        type: 'hot',
      },
      { sub: 'user-1', roles: [] },
    );

    expect(addressGenerator.generate).toHaveBeenCalledWith('testnet');
    expect(walletRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ address: 'tb1qmockaddress', ownerUserId: 'user-1' }),
    );
    expect(result).toEqual(created);
  });
});
