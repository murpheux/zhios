"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const shared_common_1 = require("@zinga/shared-common");
const ledger_movement_service_1 = require("../src/application/services/ledger-movement.service");
const debit_wallet_use_case_1 = require("../src/application/use-cases/debit-wallet.use-case");
const refund_wallet_use_case_1 = require("../src/application/use-cases/refund-wallet.use-case");
const deposit_to_wallet_use_case_1 = require("../src/application/use-cases/deposit-to-wallet.use-case");
const helpers_1 = require("./helpers");
const setup = () => {
    const walletRepository = (0, helpers_1.mockWalletRepository)();
    const ledgerRepository = (0, helpers_1.mockLedgerRepository)();
    const service = new ledger_movement_service_1.LedgerMovementService(walletRepository, ledgerRepository);
    return {
        walletRepository,
        ledgerRepository,
        debit: new debit_wallet_use_case_1.DebitWalletUseCase(service),
        refund: new refund_wallet_use_case_1.RefundWalletUseCase(service, ledgerRepository),
        deposit: new deposit_to_wallet_use_case_1.DepositToWalletUseCase(service),
    };
};
describe('DebitWalletUseCase', () => {
    it('records a pending ledger entry, applies a guarded $inc, then marks it applied', async () => {
        const { debit, walletRepository, ledgerRepository } = setup();
        const entry = (0, helpers_1.buildEntry)();
        ledgerRepository.insertPending.mockResolvedValue({ entry, inserted: true });
        walletRepository.applyBalanceMovement.mockResolvedValue({
            outcome: 'applied',
            wallet: (0, helpers_1.buildWallet)({ balanceSats: 4000 }),
        });
        const result = await debit.execute({ walletId: helpers_1.WALLET_ID, transactionId: helpers_1.TX_ID, amountSats: '1000' });
        expect(result).toEqual({ walletId: helpers_1.WALLET_ID, balanceCache: '4000' });
        expect(walletRepository.applyBalanceMovement).toHaveBeenCalledWith({
            walletId: helpers_1.WALLET_ID,
            movementId: 'ledger-1',
            deltaSats: -1000,
            requireActive: true,
        });
        const order = [
            ledgerRepository.insertPending.mock.invocationCallOrder[0],
            walletRepository.applyBalanceMovement.mock.invocationCallOrder[0],
            ledgerRepository.markApplied.mock.invocationCallOrder[0],
            walletRepository.clearPendingMovement.mock.invocationCallOrder[0],
        ];
        expect(order).toEqual([...order].sort((a = 0, b = 0) => a - b));
        expect(ledgerRepository.markApplied).toHaveBeenCalledWith(entry, 4000);
    });
    it('replays an already-applied debit with the original result and no second $inc', async () => {
        const { debit, walletRepository, ledgerRepository } = setup();
        ledgerRepository.insertPending.mockResolvedValue({
            entry: (0, helpers_1.buildEntry)({ state: 'applied', balanceAfterSats: 4000 }),
            inserted: false,
        });
        const result = await debit.execute({ walletId: helpers_1.WALLET_ID, transactionId: helpers_1.TX_ID, amountSats: '1000' });
        expect(result).toEqual({ walletId: helpers_1.WALLET_ID, balanceCache: '4000' });
        expect(walletRepository.applyBalanceMovement).not.toHaveBeenCalled();
    });
    it('resumes a pending entry from a crashed attempt without double-applying it', async () => {
        const { debit, walletRepository, ledgerRepository } = setup();
        ledgerRepository.insertPending.mockResolvedValue({ entry: (0, helpers_1.buildEntry)(), inserted: false });
        walletRepository.applyBalanceMovement.mockResolvedValue({
            outcome: 'already-applied',
            wallet: (0, helpers_1.buildWallet)({ balanceSats: 4000 }),
        });
        const result = await debit.execute({ walletId: helpers_1.WALLET_ID, transactionId: helpers_1.TX_ID, amountSats: '1000' });
        expect(result.balanceCache).toBe('4000');
        expect(ledgerRepository.markApplied).toHaveBeenCalled();
        expect(ledgerRepository.deletePending).not.toHaveBeenCalled();
    });
    it('rejects a replay of the same transactionId with a different amount', async () => {
        const { debit, ledgerRepository } = setup();
        ledgerRepository.insertPending.mockResolvedValue({
            entry: (0, helpers_1.buildEntry)({ amountSats: 999, state: 'applied', balanceAfterSats: 1 }),
            inserted: false,
        });
        await expect(debit.execute({ walletId: helpers_1.WALLET_ID, transactionId: helpers_1.TX_ID, amountSats: '1000' })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    });
    it.each([
        ['insufficient funds', { outcome: 'insufficient-funds', wallet: (0, helpers_1.buildWallet)({ balanceSats: 10 }) }, 'INSUFFICIENT_FUNDS'],
        ['suspended wallet', { outcome: 'not-active', wallet: (0, helpers_1.buildWallet)({ status: 'suspended' }) }, 'WALLET_NOT_ACTIVE'],
        ['archived wallet', { outcome: 'not-active', wallet: (0, helpers_1.buildWallet)({ status: 'archived' }) }, 'WALLET_NOT_ACTIVE'],
        ['missing wallet', { outcome: 'not-found' }, shared_common_1.NotFoundError],
    ])('compensates the pending entry and fails on %s', async (_name, outcome, expected) => {
        const { debit, walletRepository, ledgerRepository } = setup();
        ledgerRepository.insertPending.mockResolvedValue({ entry: (0, helpers_1.buildEntry)(), inserted: true });
        walletRepository.applyBalanceMovement.mockResolvedValue(outcome);
        const promise = debit.execute({ walletId: helpers_1.WALLET_ID, transactionId: helpers_1.TX_ID, amountSats: '1000' });
        if (typeof expected === 'string') {
            await expect(promise).rejects.toBeInstanceOf(shared_common_1.ConflictError);
            await expect(debit.execute({ walletId: helpers_1.WALLET_ID, transactionId: helpers_1.TX_ID, amountSats: '1000' })).rejects.toMatchObject({ code: expected });
        }
        else {
            await expect(promise).rejects.toBeInstanceOf(expected);
        }
        expect(ledgerRepository.deletePending).toHaveBeenCalledWith('ledger-1');
        expect(ledgerRepository.markApplied).not.toHaveBeenCalled();
    });
    it('treats a guard rejection as a replay when a concurrent attempt already completed', async () => {
        const { debit, walletRepository, ledgerRepository } = setup();
        ledgerRepository.insertPending.mockResolvedValue({ entry: (0, helpers_1.buildEntry)(), inserted: false });
        walletRepository.applyBalanceMovement.mockResolvedValue({
            outcome: 'insufficient-funds',
            wallet: (0, helpers_1.buildWallet)(),
        });
        ledgerRepository.findByKey.mockResolvedValue((0, helpers_1.buildEntry)({ state: 'applied', balanceAfterSats: 4000 }));
        await expect(debit.execute({ walletId: helpers_1.WALLET_ID, transactionId: helpers_1.TX_ID, amountSats: '1000' })).resolves.toEqual({ walletId: helpers_1.WALLET_ID, balanceCache: '4000' });
        expect(ledgerRepository.deletePending).not.toHaveBeenCalled();
    });
    it.each(['0', '-1', '1.5', '01', '9007199254740993', '2100000000000001'])('rejects invalid amountSats %s before touching storage', async (amountSats) => {
        const { debit, ledgerRepository } = setup();
        await expect(debit.execute({ walletId: helpers_1.WALLET_ID, transactionId: helpers_1.TX_ID, amountSats })).rejects.toBeInstanceOf(shared_common_1.ValidationError);
        expect(ledgerRepository.insertPending).not.toHaveBeenCalled();
    });
});
describe('RefundWalletUseCase', () => {
    it('credits back an applied debit, idempotently keyed by transactionId', async () => {
        const { refund, walletRepository, ledgerRepository } = setup();
        ledgerRepository.findByKey.mockResolvedValue((0, helpers_1.buildEntry)({ state: 'applied', balanceAfterSats: 4000 }));
        ledgerRepository.insertPending.mockResolvedValue({
            entry: (0, helpers_1.buildEntry)({ id: 'ledger-2', kind: 'credit', reason: 'refund' }),
            inserted: true,
        });
        walletRepository.applyBalanceMovement.mockResolvedValue({
            outcome: 'applied',
            wallet: (0, helpers_1.buildWallet)({ balanceSats: 5000, status: 'suspended' }),
        });
        const result = await refund.execute({ walletId: helpers_1.WALLET_ID, transactionId: helpers_1.TX_ID, amountSats: '1000' });
        expect(result.balanceCache).toBe('5000');
        expect(ledgerRepository.insertPending).toHaveBeenCalledWith(expect.objectContaining({ kind: 'credit', reason: 'refund', amountSats: 1000 }));
        // Credits never require an active wallet: returned funds must not be lost.
        expect(walletRepository.applyBalanceMovement).toHaveBeenCalledWith(expect.objectContaining({ deltaSats: 1000, requireActive: false }));
    });
    it.each([
        ['no debit exists', null],
        ['debit still pending', (0, helpers_1.buildEntry)({ state: 'pending' })],
        ['debit on another wallet', (0, helpers_1.buildEntry)({ state: 'applied', walletId: 'ffffffffffffffffffffffff' })],
        ['amount differs from debit', (0, helpers_1.buildEntry)({ state: 'applied', amountSats: 500 })],
    ])('refuses to mint funds when %s', async (_name, debitEntry) => {
        const { refund, ledgerRepository } = setup();
        ledgerRepository.findByKey.mockResolvedValue(debitEntry);
        await expect(refund.execute({ walletId: helpers_1.WALLET_ID, transactionId: helpers_1.TX_ID, amountSats: '1000' })).rejects.toMatchObject({ code: 'REFUND_WITHOUT_DEBIT' });
        expect(ledgerRepository.insertPending).not.toHaveBeenCalled();
    });
});
describe('DepositToWalletUseCase', () => {
    it('credits the wallet with reason deposit, keyed by the external reference', async () => {
        const { deposit, walletRepository, ledgerRepository } = setup();
        ledgerRepository.insertPending.mockResolvedValue({
            entry: (0, helpers_1.buildEntry)({ kind: 'credit', reason: 'deposit', transactionId: 'faucet-1', amountSats: 100000 }),
            inserted: true,
        });
        walletRepository.applyBalanceMovement.mockResolvedValue({
            outcome: 'applied',
            wallet: (0, helpers_1.buildWallet)({ balanceSats: 100000 }),
        });
        const result = await deposit.execute(helpers_1.WALLET_ID, { amountSats: '100000', reference: 'faucet-1' }, { sub: 'admin-1', roles: ['admin'] });
        expect(result.balanceCache).toBe('100000');
        expect(ledgerRepository.insertPending).toHaveBeenCalledWith({
            walletId: helpers_1.WALLET_ID,
            transactionId: 'faucet-1',
            kind: 'credit',
            reason: 'deposit',
            amountSats: 100000,
        });
    });
    it.each([
        ['plain user', []],
        ['auditor', ['auditor']],
    ])('forbids a %s', async (_name, roles) => {
        const { deposit, ledgerRepository } = setup();
        await expect(deposit.execute(helpers_1.WALLET_ID, { amountSats: '1', reference: 'x-1' }, { sub: 'u', roles })).rejects.toBeInstanceOf(shared_common_1.ForbiddenError);
        expect(ledgerRepository.insertPending).not.toHaveBeenCalled();
    });
});
