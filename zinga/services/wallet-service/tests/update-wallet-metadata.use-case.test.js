"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const shared_common_1 = require("@zinga/shared-common");
const update_wallet_metadata_use_case_1 = require("../src/application/use-cases/update-wallet-metadata.use-case");
const helpers_1 = require("./helpers");
describe('UpdateWalletMetadataUseCase', () => {
    it('lets the owner update label/metadata', async () => {
        const repo = (0, helpers_1.mockWalletRepository)();
        repo.findById.mockResolvedValue((0, helpers_1.buildWallet)());
        repo.updateMetadata.mockResolvedValue((0, helpers_1.buildWallet)({ label: 'Renamed' }));
        const result = await new update_wallet_metadata_use_case_1.UpdateWalletMetadataUseCase(repo).execute(helpers_1.WALLET_ID, { label: 'Renamed' }, { sub: 'user-1', roles: [] });
        expect(result.label).toBe('Renamed');
    });
    it.each([
        ['admin non-owner', { sub: 'admin-1', roles: ['admin'] }, shared_common_1.ForbiddenError],
        ['auditor non-owner', { sub: 'aud-1', roles: ['auditor'] }, shared_common_1.ForbiddenError],
        ['plain non-owner', { sub: 'user-2', roles: [] }, shared_common_1.NotFoundError],
    ])('rejects a %s without writing', async (_name, actor, errorType) => {
        const repo = (0, helpers_1.mockWalletRepository)();
        repo.findById.mockResolvedValue((0, helpers_1.buildWallet)());
        await expect(new update_wallet_metadata_use_case_1.UpdateWalletMetadataUseCase(repo).execute(helpers_1.WALLET_ID, { label: 'x' }, actor)).rejects.toBeInstanceOf(errorType);
        expect(repo.updateMetadata).not.toHaveBeenCalled();
    });
    it('returns 404 for a missing wallet', async () => {
        const repo = (0, helpers_1.mockWalletRepository)();
        repo.findById.mockResolvedValue(null);
        await expect(new update_wallet_metadata_use_case_1.UpdateWalletMetadataUseCase(repo).execute(helpers_1.WALLET_ID, {}, { sub: 'user-1', roles: [] })).rejects.toBeInstanceOf(shared_common_1.NotFoundError);
    });
});
describe('UpdateWalletMetadataUseCase (lost update)', () => {
    it('404s when the wallet disappears between the ownership check and the write', async () => {
        const repository = (0, helpers_1.mockWalletRepository)();
        repository.findById.mockResolvedValue((0, helpers_1.buildWallet)({ ownerUserId: 'user-1' }));
        repository.updateMetadata.mockResolvedValue(null);
        await expect(new update_wallet_metadata_use_case_1.UpdateWalletMetadataUseCase(repository).execute(helpers_1.WALLET_ID, { label: 'x' }, { sub: 'user-1', roles: [] })).rejects.toBeInstanceOf(shared_common_1.NotFoundError);
    });
});
