"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const src_1 = require("../src");
describe('isPrivileged', () => {
    it.each([
        [[], false],
        [['user'], false],
        [['service'], false],
        [['admin'], true],
        [['auditor'], true],
        [['user', 'auditor'], true],
    ])('roles %j -> %p', (roles, expected) => {
        expect((0, src_1.isPrivileged)({ sub: 'u', roles })).toBe(expected);
    });
});
describe('toPaginatedResult', () => {
    it.each([
        [0, 20, 1],
        [1, 20, 1],
        [20, 20, 1],
        [21, 20, 2],
        [101, 10, 11],
    ])('total=%d limit=%d -> totalPages=%d', (total, limit, totalPages) => {
        expect((0, src_1.toPaginatedResult)(['a'], total, { page: 2, limit })).toEqual({
            items: ['a'],
            total,
            page: 2,
            limit,
            totalPages,
        });
    });
});
describe('wire patterns', () => {
    const amount = new RegExp(src_1.SATS_AMOUNT_PATTERN);
    const balance = new RegExp(src_1.SATS_BALANCE_PATTERN);
    const objectId = new RegExp(src_1.OBJECT_ID_PATTERN);
    it.each([
        ['0', false, true],
        ['1', true, true],
        ['100000', true, true],
        ['2100000000000000', true, true],
        ['12345678901234567', false, false],
        ['01', false, false],
        ['-1', false, false],
        ['1.5', false, false],
        ['1e3', false, false],
        ['', false, false],
    ])('%p amount=%p balance=%p', (value, isAmount, isBalance) => {
        expect(amount.test(value)).toBe(isAmount);
        expect(balance.test(value)).toBe(isBalance);
    });
    it.each([
        ['6710f1f1c2a1b2c3d4e5f6a7', true],
        ['6710F1F1C2A1B2C3D4E5F6A7', false],
        ['6710f1f1c2a1b2c3d4e5f6a', false],
        ['not-an-id', false],
    ])('ObjectId %p -> %p', (value, expected) => {
        expect(objectId.test(value)).toBe(expected);
    });
    it('exposes the transaction enums', () => {
        expect(src_1.TRANSACTION_TYPES).toEqual(['send', 'receive', 'internal-transfer']);
        expect(src_1.TRANSACTION_STATUSES).toEqual(['pending', 'broadcasting', 'broadcast', 'confirmed', 'failed']);
    });
});
