"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const create_wallet_use_case_1 = require("../src/application/use-cases/create-wallet.use-case");
describe('CreateWalletUseCase', () => {
    const buildWallet = (overrides = {}) => ({
        id: 'wallet-1',
        label: 'My Wallet',
        address: 'tb1qmockaddress',
        network: 'testnet',
        type: 'hot',
        balanceSats: 0,
        metadata: {},
        ownerUserId: 'user-1',
        status: 'active',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
        ...overrides,
    });
    it('generates an address and persists the new wallet', async () => {
        const created = buildWallet();
        const walletRepository = {
            create: jest.fn().mockResolvedValue(created),
            findById: jest.fn(),
            findMany: jest.fn(),
            updateMetadata: jest.fn(),
            applyBalanceMovement: jest.fn(),
            clearPendingMovement: jest.fn(),
        };
        const addressGenerator = {
            generate: jest.fn().mockResolvedValue('tb1qmockaddress'),
        };
        const useCase = new create_wallet_use_case_1.CreateWalletUseCase(walletRepository, addressGenerator);
        const result = await useCase.execute({
            label: 'My Wallet',
            network: 'testnet',
            type: 'hot',
        }, { sub: 'user-1', roles: [] });
        expect(addressGenerator.generate).toHaveBeenCalledWith('testnet');
        expect(walletRepository.create).toHaveBeenCalledWith(expect.objectContaining({ address: 'tb1qmockaddress', ownerUserId: 'user-1' }));
        expect(result).toEqual(created);
    });
});
