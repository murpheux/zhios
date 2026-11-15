"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_crypto_1 = require("node:crypto");
const fastify_1 = __importDefault(require("fastify"));
const src_1 = require("../src");
const SECRET = 'internal-jwt-secret-0123456789abcdef';
const ISSUER = 'zuma-internal';
const AUDIENCE = 'wallet-service';
const NOW = 1700000000000;
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const forge = (payload, header = { alg: 'HS256', typ: 'JWT' }, rawPayload) => {
    const input = `${b64(header)}.${rawPayload ?? b64(payload)}`;
    return `${input}.${(0, node_crypto_1.createHmac)('sha256', SECRET).update(input).digest('base64url')}`;
};
const claims = (extra = {}) => ({
    sub: 'transaction-service',
    aud: AUDIENCE,
    role: 'service',
    iss: ISSUER,
    iat: NOW / 1000,
    exp: NOW / 1000 + 60,
    ...extra,
});
const verify = (token, extra = {}) => (0, src_1.verifyServiceToken)(token, { secret: SECRET, issuer: ISSUER, audience: AUDIENCE, now: () => NOW, ...extra });
describe('createServiceTokenSigner validation', () => {
    it.each([
        ['missing serviceName', { serviceName: '' }, /serviceName is required/],
        ['missing issuer', { issuer: '' }, /issuer is required/],
        ['zero ttl', { ttlSeconds: 0 }, /ttlSeconds/],
        ['ttl over 300s', { ttlSeconds: 301 }, /ttlSeconds/],
        ['fractional ttl', { ttlSeconds: 1.5 }, /ttlSeconds/],
        ['non-string secret', { secret: 123 }, /at least 32/],
    ])('rejects %s', (_name, overrides, message) => {
        expect(() => (0, src_1.createServiceTokenSigner)({ secret: SECRET, issuer: ISSUER, serviceName: 'svc', ...overrides })).toThrow(message);
    });
    it('requires an audience when signing', () => {
        const signer = (0, src_1.createServiceTokenSigner)({ secret: SECRET, issuer: ISSUER, serviceName: 'svc' });
        expect(() => signer.sign('')).toThrow('audience is required');
    });
    it('honours a custom ttl', () => {
        const signer = (0, src_1.createServiceTokenSigner)({ secret: SECRET, issuer: ISSUER, serviceName: 'svc', ttlSeconds: 300, now: () => NOW });
        const payload = JSON.parse(Buffer.from(signer.sign(AUDIENCE).split('.')[1] ?? '', 'base64url').toString());
        expect(payload.exp - payload.iat).toBe(300);
    });
});
describe('verifyServiceToken edge cases', () => {
    it('accepts a well-formed token at the clock', () => {
        expect(verify(forge(claims()))).toBe('transaction-service');
    });
    it.each([
        ['non-string token', () => 42, /malformed/],
        ['two segments', () => 'a.b', /malformed/],
        ['header not JSON', () => `!!!.${b64(claims())}.sig`, /malformed/],
        ['header is an array', () => forge(claims(), ['HS256']), /malformed/],
        ['header is null', () => forge(claims(), null), /malformed/],
        ['payload not JSON (validly signed)', () => forge(undefined, undefined, 'bm90LWpzb24'), /malformed/],
        ['payload is a string (validly signed)', () => forge('just-a-string'), /malformed/],
        ['truncated signature', () => forge(claims()).slice(0, -4), /bad signature/],
        ['role mismatch', () => forge(claims({ role: 'admin' })), /role mismatch/],
        ['missing sub', () => forge(claims({ sub: '' })), /missing sub/],
        ['non-string sub', () => forge(claims({ sub: 7 })), /missing sub/],
        ['missing exp', () => forge(claims({ exp: undefined })), /expired/],
        ['expired beyond skew', () => forge(claims({ exp: NOW / 1000 - 5 })), /expired/],
        ['issued in the future beyond skew', () => forge(claims({ iat: NOW / 1000 + 6 })), /issued in the future/],
    ])('rejects %s', (_name, makeToken, message) => {
        expect(() => verify(makeToken())).toThrow(message);
    });
    it('tolerates small clock skew in both directions', () => {
        expect(verify(forge(claims({ exp: NOW / 1000 - 4, iat: NOW / 1000 + 5 })))).toBe('transaction-service');
    });
    it('honours a custom clock skew', () => {
        expect(() => verify(forge(claims({ exp: NOW / 1000 - 1 })), { clockSkewSeconds: 0 })).toThrow(/expired/);
    });
    it('accepts tokens without iat', () => {
        expect(verify(forge(claims({ iat: undefined })))).toBe('transaction-service');
    });
    it('refuses to verify with a short secret', () => {
        expect(() => verify(forge(claims()), { secret: 'short' })).toThrow(/at least 32/);
    });
});
describe('serviceAuthPlugin edge cases', () => {
    it('refuses to start without a serviceName', async () => {
        const app = (0, fastify_1.default)();
        app.register(src_1.serviceAuthPlugin, { secret: SECRET, issuer: ISSUER, serviceName: '' });
        await expect(app.ready()).rejects.toThrow('serviceName is required');
    });
    it('refuses to start with a short secret', async () => {
        const app = (0, fastify_1.default)();
        app.register(src_1.serviceAuthPlugin, { secret: 'short', issuer: ISSUER, serviceName: AUDIENCE });
        await expect(app.ready()).rejects.toThrow(/at least 32/);
    });
    it('401s an empty header and 403s when allowServiceCallers runs without a verified caller', async () => {
        const app = (0, fastify_1.default)();
        await app.register(src_1.serviceAuthPlugin, { secret: SECRET, issuer: ISSUER, serviceName: AUDIENCE });
        app.setErrorHandler(src_1.errorHandler);
        app.get('/svc', { preHandler: app.requireService }, async () => ({ ok: true }));
        app.get('/callers-only', { preHandler: (0, src_1.allowServiceCallers)('transaction-service') }, async () => ({ ok: true }));
        await app.ready();
        const empty = await app.inject({ method: 'GET', url: '/svc', headers: { [src_1.SERVICE_TOKEN_HEADER]: '' } });
        expect(empty.statusCode).toBe(401);
        expect(empty.json()).toMatchObject({ message: 'Missing service token' });
        const bad = await app.inject({ method: 'GET', url: '/svc', headers: { [src_1.SERVICE_TOKEN_HEADER]: 'x.y.z' } });
        expect(bad.statusCode).toBe(401);
        expect(bad.json()).toMatchObject({ message: 'Invalid service token' });
        expect((await app.inject({ method: 'GET', url: '/callers-only' })).statusCode).toBe(403);
        await app.close();
    });
});
describe('healthPlugin defaults', () => {
    it('is ready with no checks configured', async () => {
        const app = (0, fastify_1.default)();
        await app.register(src_1.healthPlugin);
        const res = await app.inject({ method: 'GET', url: '/readyz' });
        expect(res.statusCode).toBe(200);
        await app.close();
    });
    it('is not ready when a check rejects with a non-Error value', async () => {
        const app = (0, fastify_1.default)();
        await app.register(src_1.healthPlugin, { checks: [() => Promise.reject('plain string reason')] });
        const res = await app.inject({ method: 'GET', url: '/readyz' });
        expect(res.statusCode).toBe(503);
        expect(res.json()).toEqual({ status: 'not-ready' });
        await app.close();
    });
});
