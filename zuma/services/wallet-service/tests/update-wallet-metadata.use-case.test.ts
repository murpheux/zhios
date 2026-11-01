import { ForbiddenError, NotFoundError, type Actor } from '@zuma/shared-common';
import { UpdateWalletMetadataUseCase } from '../src/application/use-cases/update-wallet-metadata.use-case';
import { WALLET_ID, buildWallet, mockWalletRepository } from './helpers';

describe('UpdateWalletMetadataUseCase', () => {
  it('lets the owner update label/metadata', async () => {
    const repo = mockWalletRepository();
    repo.findById.mockResolvedValue(buildWallet());
    repo.updateMetadata.mockResolvedValue(buildWallet({ label: 'Renamed' }));

    const result = await new UpdateWalletMetadataUseCase(repo).execute(
      WALLET_ID,
      { label: 'Renamed' },
      { sub: 'user-1', roles: [] },
    );
    expect(result.label).toBe('Renamed');
  });

  it.each<[string, Actor, new (...args: never[]) => Error]>([
    ['admin non-owner', { sub: 'admin-1', roles: ['admin'] }, ForbiddenError],
    ['auditor non-owner', { sub: 'aud-1', roles: ['auditor'] }, ForbiddenError],
    ['plain non-owner', { sub: 'user-2', roles: [] }, NotFoundError],
  ])('rejects a %s without writing', async (_name, actor, errorType) => {
    const repo = mockWalletRepository();
    repo.findById.mockResolvedValue(buildWallet());

    await expect(
      new UpdateWalletMetadataUseCase(repo).execute(WALLET_ID, { label: 'x' }, actor),
    ).rejects.toBeInstanceOf(errorType);
    expect(repo.updateMetadata).not.toHaveBeenCalled();
  });

  it('returns 404 for a missing wallet', async () => {
    const repo = mockWalletRepository();
    repo.findById.mockResolvedValue(null);
    await expect(
      new UpdateWalletMetadataUseCase(repo).execute(WALLET_ID, {}, { sub: 'user-1', roles: [] }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('UpdateWalletMetadataUseCase (lost update)', () => {
  it('404s when the wallet disappears between the ownership check and the write', async () => {
    const repository = mockWalletRepository();
    repository.findById.mockResolvedValue(buildWallet({ ownerUserId: 'user-1' }));
    repository.updateMetadata.mockResolvedValue(null);
    await expect(
      new UpdateWalletMetadataUseCase(repository).execute(WALLET_ID, { label: 'x' }, { sub: 'user-1', roles: [] }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
