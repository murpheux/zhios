"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const wallet_entity_1 = require("../src/domain/entities/wallet.entity");
const satoshi_1 = require("../src/domain/value-objects/satoshi");
const wallet_presenter_1 = require("../src/api/routes/wallet.presenter");
const helpers_1 = require("./helpers");
describe('satoshi value object', () => {
    it.each([
        ['1', 1],
        ['100000', 100000],
        ['2100000000000000', satoshi_1.MAX_SUPPLY_SATS],
        ['2100000000000001', null],
        ['9999999999999999', null],
        ['0', null],
        ['01', null],
        ['-1', null],
        ['1.0', null],
        ['1e3', null],
        [' 1', null],
        ['', null],
        ['12345678901234567', null],
    ])('parseSatsAmount(%p) -> %p', (value, expected) => {
        expect((0, satoshi_1.parseSatsAmount)(value)).toBe(expected);
    });
    it.each([
        [0, false, true],
        [1, true, true],
        [satoshi_1.MAX_SUPPLY_SATS, true, true],
        [satoshi_1.MAX_SUPPLY_SATS + 1, false, false],
        [-1, false, false],
        [1.5, false, false],
        [Number.NaN, false, false],
        [Number.POSITIVE_INFINITY, false, false],
    ])('%p: amount=%p balance=%p', (value, amount, balance) => {
        expect((0, satoshi_1.isValidSatsAmount)(value)).toBe(amount);
        expect((0, satoshi_1.isValidSatsBalance)(value)).toBe(balance);
    });
    it.each([
        [0, '0'],
        [42, '42'],
        [satoshi_1.MAX_SUPPLY_SATS, '2100000000000000'],
    ])('formatSats(%p) -> %p (no exponent)', (value, expected) => {
        expect((0, satoshi_1.formatSats)(value)).toBe(expected);
    });
});
describe('wallet entity', () => {
    it('creates an active, zero-balance wallet with empty metadata by default', () => {
        expect((0, wallet_entity_1.createWalletEntity)({ label: 'L', address: 'tb1q', network: 'testnet', type: 'cold', ownerUserId: 'u1' })).toEqual({
            label: 'L',
            address: 'tb1q',
            network: 'testnet',
            type: 'cold',
            ownerUserId: 'u1',
            balanceSats: 0,
            metadata: {},
            status: 'active',
        });
    });
    it('keeps provided metadata', () => {
        const draft = (0, wallet_entity_1.createWalletEntity)({
            label: 'L',
            address: 'a',
            network: 'mainnet',
            type: 'hot',
            ownerUserId: 'u',
            metadata: { purpose: 'savings' },
        });
        expect(draft.metadata).toEqual({ purpose: 'savings' });
    });
    it.each([
        ['active', true],
        ['suspended', false],
        ['archived', false],
    ])('canBeDebited(%s) -> %p', (status, expected) => {
        expect((0, wallet_entity_1.canBeDebited)({ status })).toBe(expected);
    });
});
describe('toWalletResponse', () => {
    it('replaces integer balanceSats with the balanceCache sats string', () => {
        const response = (0, wallet_presenter_1.toWalletResponse)((0, helpers_1.buildWallet)({ balanceSats: 150000 }));
        expect(response.balanceCache).toBe('150000');
        expect(response).not.toHaveProperty('balanceSats');
    });
});
