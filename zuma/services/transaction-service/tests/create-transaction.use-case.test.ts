import { ConflictError, ForbiddenError, ValidationError, type Actor } from '@zuma/shared-common';
import {
  CreateTransactionUseCase,
  type CreateTransactionInput,
} from '../src/application/use-cases/create-transaction.use-case';
import { DuplicateIdempotencyKeyError } from '../src/application/ports/transaction-repository.port';
import {
  MAINNET_P2WPKH,
  TESTNET_P2WSH,
  TX_ID,
  WALLET_ID,
  buildTransaction,
  buildWalletSummary,
  mockAudit,
  mockNode,
  mockTransactionRepository,
  mockWalletService,
} from './helpers';

const owner: Actor = { sub: 'user-1', roles: [] };

const baseInput = (overrides: Partial<CreateTransactionInput> = {}): CreateTransactionInput => ({
  walletId: WALLET_ID,
  type: 'send',
  amount: '100000',
  feeRate: '12',
  destinationAddress: TESTNET_P2WSH,
  idempotencyKey: 'idem-key-0001',
  ...overrides,
});

const setup = () => {
  const repo = mockTransactionRepository();
  const node = mockNode();
  const audit = mockAudit();
  const wallet = mockWalletService();
  const useCase = new CreateTransactionUseCase(repo, node, audit, wallet, 'testnet');
  return { repo, node, audit, wallet, useCase };
};

describe('CreateTransactionUseCase', () => {
  it('builds, signs, persists once with rawTx + destination, then debits amount + fee', async () => {
    const { repo, node, wallet, audit, useCase } = setup();
    const created = buildTransaction();
    const reserved = buildTransaction({ debitedAt: new Date() });
    repo.create.mockResolvedValue(created);
    repo.transition.mockResolvedValue(reserved);

    const result = await useCase.execute(baseInput(), owner);

    expect(node.build).toHaveBeenCalledWith({
      walletId: WALLET_ID,
      network: 'testnet',
      amountSats: 100000,
      feeRate: 12,
      destinationAddress: TESTNET_P2WSH,
    });
    expect(repo.create).toHaveBeenCalledTimes(1);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        rawTx: 'rawtx:signed',
        destinationAddress: TESTNET_P2WSH,
        feeSats: '1692',
        idempotencyKey: 'idem-key-0001',
        ownerUserId: 'user-1',
      }),
    );
    expect(wallet.debit).toHaveBeenCalledWith({ walletId: WALLET_ID, transactionId: TX_ID, amountSats: '101692' });
    expect(repo.transition).toHaveBeenCalledWith(TX_ID, 'pending', { debitedAt: expect.any(Date) });
    expect(audit.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'transaction.created' }));
    expect(result).toBe(reserved);
  });

  it.each<[string, Partial<CreateTransactionInput>]>([
    ['missing idempotency key', { idempotencyKey: undefined }],
    ['too-short idempotency key', { idempotencyKey: 'short' }],
    ['idempotency key with bad chars', { idempotencyKey: 'bad key with spaces' }],
    ['receive type', { type: 'receive' }],
    ['internal-transfer type', { type: 'internal-transfer' }],
    ['decimal BTC amount', { amount: '0.001' }],
    ['zero amount', { amount: '0' }],
    ['amount above max supply', { amount: '2100000000000001' }],
    ['zero fee rate', { feeRate: '0' }],
    ['fee rate above 10000', { feeRate: '10001' }],
    ['mainnet destination for testnet wallet', { destinationAddress: MAINNET_P2WPKH }],
    ['garbage destination', { destinationAddress: 'tb1qdestinationaddressexample' }],
  ])('rejects %s with 400 and no side effects', async (_name, overrides) => {
    const { repo, node, wallet, useCase } = setup();
    await expect(useCase.execute(baseInput(overrides), owner)).rejects.toBeInstanceOf(ValidationError);
    expect(node.build).not.toHaveBeenCalled();
    expect(repo.create).not.toHaveBeenCalled();
    expect(wallet.debit).not.toHaveBeenCalled();
  });

  it.each<[string, Actor]>([
    ['another user', { sub: 'user-2', roles: [] }],
    ['an admin non-owner', { sub: 'admin-1', roles: ['admin'] }],
    ['an auditor non-owner', { sub: 'aud-1', roles: ['auditor'] }],
  ])('forbids %s from spending the wallet', async (_name, actor) => {
    const { repo, wallet, useCase } = setup();
    await expect(useCase.execute(baseInput(), actor)).rejects.toBeInstanceOf(ForbiddenError);
    expect(repo.create).not.toHaveBeenCalled();
    expect(wallet.debit).not.toHaveBeenCalled();
  });

  it('forbids when the wallet does not exist (same answer as not-owned)', async () => {
    const { wallet, useCase } = setup();
    wallet.getWallet.mockResolvedValue(null);
    await expect(useCase.execute(baseInput(), owner)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it.each(['suspended', 'archived'] as const)('rejects sending from a %s wallet with 409', async (status) => {
    const { repo, wallet, useCase } = setup();
    wallet.getWallet.mockResolvedValue(buildWalletSummary({ status }));
    await expect(useCase.execute(baseInput(), owner)).rejects.toMatchObject({ code: 'WALLET_NOT_ACTIVE' });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('rejects a wallet on a different network than the node', async () => {
    const { wallet, useCase } = setup();
    wallet.getWallet.mockResolvedValue(buildWalletSummary({ network: 'mainnet' }));
    await expect(useCase.execute(baseInput({ destinationAddress: MAINNET_P2WPKH }), owner)).rejects.toMatchObject({
      code: 'NETWORK_MISMATCH',
    });
  });

  it('marks the transaction failed and surfaces 409 when the debit is rejected for insufficient funds', async () => {
    const { repo, wallet, useCase } = setup();
    repo.create.mockResolvedValue(buildTransaction());
    wallet.debit.mockResolvedValue({ ok: false, code: 'INSUFFICIENT_FUNDS', message: 'insufficient' });

    const promise = useCase.execute(baseInput(), owner);
    await expect(promise).rejects.toBeInstanceOf(ConflictError);
    await expect(promise).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
    expect(repo.transition).toHaveBeenCalledWith(TX_ID, 'pending', {
      status: 'failed',
      failureReason: 'INSUFFICIENT_FUNDS',
    });
  });

  it('leaves the transaction pending (no debitedAt) when wallet-service is unreachable', async () => {
    const { repo, wallet, useCase } = setup();
    repo.create.mockResolvedValue(buildTransaction());
    wallet.debit.mockRejectedValue(new Error('timeout'));

    await expect(useCase.execute(baseInput(), owner)).rejects.toThrow('timeout');
    expect(repo.transition).not.toHaveBeenCalled();
  });

  describe('idempotent replay', () => {
    it('returns the original funded transaction without building or debiting again', async () => {
      const { repo, node, wallet, useCase } = setup();
      const original = buildTransaction({ debitedAt: new Date() });
      repo.findByIdempotencyKey.mockResolvedValue(original);

      await expect(useCase.execute(baseInput(), owner)).resolves.toBe(original);
      expect(repo.findByIdempotencyKey).toHaveBeenCalledWith('user-1', 'idem-key-0001');
      expect(node.build).not.toHaveBeenCalled();
      expect(wallet.debit).not.toHaveBeenCalled();
    });

    it('resumes the (idempotent) debit for a pending transaction that was never funded', async () => {
      const { repo, wallet, useCase } = setup();
      repo.findByIdempotencyKey.mockResolvedValue(buildTransaction());
      repo.transition.mockResolvedValue(buildTransaction({ debitedAt: new Date() }));

      const result = await useCase.execute(baseInput(), owner);
      expect(wallet.debit).toHaveBeenCalledWith(expect.objectContaining({ transactionId: TX_ID }));
      expect(result.debitedAt).not.toBeNull();
    });

    it('re-raises the original 409 for a transaction whose debit was rejected', async () => {
      const { repo, wallet, useCase } = setup();
      repo.findByIdempotencyKey.mockResolvedValue(
        buildTransaction({ status: 'failed', failureReason: 'INSUFFICIENT_FUNDS' }),
      );
      await expect(useCase.execute(baseInput(), owner)).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
      expect(wallet.debit).not.toHaveBeenCalled();
    });

    it.each<[string, Partial<CreateTransactionInput>]>([
      ['different amount', { amount: '100001' }],
      ['different destination', { destinationAddress: 'tb1pqqqqp399et2xygdj5xreqhjjvcmzhxw4aywxecjdzew6hylgvsesf3hn0c' }],
      ['different fee rate', { feeRate: '13' }],
    ])('rejects reuse of the key with a %s (IDEMPOTENCY_CONFLICT)', async (_name, overrides) => {
      const { repo, useCase } = setup();
      repo.findByIdempotencyKey.mockResolvedValue(buildTransaction({ debitedAt: new Date() }));
      await expect(useCase.execute(baseInput(overrides), owner)).rejects.toMatchObject({
        code: 'IDEMPOTENCY_CONFLICT',
      });
    });

    it('handles the concurrent-duplicate race (E11000) by returning the winning record', async () => {
      const { repo, wallet, useCase } = setup();
      const winner = buildTransaction({ debitedAt: new Date() });
      repo.findByIdempotencyKey.mockResolvedValueOnce(null).mockResolvedValueOnce(winner);
      repo.create.mockRejectedValue(new DuplicateIdempotencyKeyError('user-1', 'idem-key-0001'));

      await expect(useCase.execute(baseInput(), owner)).resolves.toBe(winner);
      expect(wallet.debit).not.toHaveBeenCalled();
    });

    it('surfaces IDEMPOTENCY_CONFLICT when the race winner had a different body', async () => {
      const { repo, useCase } = setup();
      repo.findByIdempotencyKey
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(buildTransaction({ amount: '5' }));
      repo.create.mockRejectedValue(new DuplicateIdempotencyKeyError('user-1', 'idem-key-0001'));

      await expect(useCase.execute(baseInput(), owner)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    });
  });
});
