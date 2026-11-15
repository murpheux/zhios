"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const src_1 = require("../src");
const jwt_helpers_1 = require("./jwt-helpers");
const JWT_SECRET = 'user-jwt-secret-0123456789';
const INTERNAL_SECRET = 'internal-jwt-secret-0123456789abcdef';
const ISSUER = 'zuma';
const ALLOWED = 'https://app.example.com';
const build = async (overrides = {}, { withAuth = true } = {}) => {
    const app = (0, fastify_1.default)();
    await app.register(src_1.securityPlugin, {
        corsAllowedOrigins: [ALLOWED],
        rateLimitMax: 2,
        rateLimitWindow: '1 minute',
        ...overrides,
    });
    if (withAuth) {
        await app.register(src_1.authPlugin, { jwtSecret: JWT_SECRET, jwtIssuer: ISSUER });
    }
    app.setErrorHandler(src_1.errorHandler);
    app.get('/data', async () => ({ ok: true }));
    app.get('/healthz', async () => ({ status: 'ok' }));
    await app.ready();
    return app;
};
const userToken = (sub) => (0, jwt_helpers_1.signHs256)({ sub, iss: ISSUER, exp: (0, jwt_helpers_1.nowSeconds)() + 300 }, JWT_SECRET);
describe('securityPlugin', () => {
    const apps = [];
    const make = async (...args) => {
        const app = await build(...args);
        apps.push(app);
        return app;
    };
    afterEach(async () => {
        await Promise.all(apps.splice(0).map((app) => app.close()));
    });
    it("refuses '*' origins together with credentials", async () => {
        const app = (0, fastify_1.default)();
        app.register(src_1.securityPlugin, {
            corsAllowedOrigins: ['*'],
            corsAllowCredentials: true,
            rateLimitMax: 1,
            rateLimitWindow: 1000,
        });
        await expect(app.ready()).rejects.toThrow("'*' CORS origin is not allowed with credentials");
    });
    describe('helmet', () => {
        it('sets hardened headers with CSP on by default', async () => {
            const app = await make();
            const res = await app.inject({ method: 'GET', url: '/data' });
            expect(res.headers['x-content-type-options']).toBe('nosniff');
            expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
            expect(res.headers['strict-transport-security']).toBeDefined();
            expect(res.headers['content-security-policy']).toBeDefined();
        });
        it('can disable CSP for HTML doc UIs', async () => {
            const app = await make({ contentSecurityPolicy: false });
            const res = await app.inject({ method: 'GET', url: '/data' });
            expect(res.headers['content-security-policy']).toBeUndefined();
            expect(res.headers['x-content-type-options']).toBe('nosniff');
        });
    });
    describe('CORS', () => {
        const preflight = (app, origin) => app.inject({
            method: 'OPTIONS',
            url: '/data',
            headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization' },
        });
        it('echoes an allow-listed origin with the allowed methods/headers', async () => {
            const res = await preflight(await make(), ALLOWED);
            expect(res.statusCode).toBe(204);
            expect(res.headers['access-control-allow-origin']).toBe(ALLOWED);
            expect(res.headers['access-control-allow-methods']).toContain('PATCH');
            expect(res.headers['access-control-allow-headers']).toBe('authorization, content-type, idempotency-key, x-request-id');
            expect(res.headers['access-control-max-age']).toBe('600');
            expect(res.headers['access-control-allow-credentials']).toBeUndefined();
        });
        it('ignores origins that are not on the allow-list', async () => {
            const res = await preflight(await make(), 'https://evil.example.com');
            expect(res.headers['access-control-allow-origin']).toBeUndefined();
        });
        it('disables cross-origin access entirely when the list is empty', async () => {
            const app = await make({ corsAllowedOrigins: [] });
            const res = await app.inject({ method: 'GET', url: '/data', headers: { origin: ALLOWED } });
            expect(res.headers['access-control-allow-origin']).toBeUndefined();
        });
        it("answers '*' when explicitly configured without credentials", async () => {
            const app = await make({ corsAllowedOrigins: ['*'] });
            const res = await app.inject({ method: 'GET', url: '/data', headers: { origin: 'https://any.example.com' } });
            expect(res.headers['access-control-allow-origin']).toBe('*');
        });
        it('sends allow-credentials for listed origins when enabled', async () => {
            const app = await make({ corsAllowCredentials: true });
            const res = await app.inject({ method: 'GET', url: '/data', headers: { origin: ALLOWED } });
            expect(res.headers['access-control-allow-origin']).toBe(ALLOWED);
            expect(res.headers['access-control-allow-credentials']).toBe('true');
        });
    });
    describe('rate limiting', () => {
        const hit = (app, headers = {}, url = '/data') => app.inject({ method: 'GET', url, headers });
        it('returns rate-limit headers and a RATE_LIMITED 429 once the budget is spent', async () => {
            const app = await make();
            const first = await hit(app);
            expect(first.headers['x-ratelimit-limit']).toBe('2');
            expect(first.headers['x-ratelimit-remaining']).toBe('1');
            await hit(app);
            const limited = await hit(app);
            expect(limited.statusCode).toBe(429);
            expect(limited.headers['retry-after']).toBeDefined();
            expect(limited.json()).toMatchObject({ statusCode: 429, code: 'RATE_LIMITED' });
            expect(limited.json().message).toMatch(/^Rate limit exceeded, retry in /);
        });
        it('exempts probe paths (including with a query string) by default', async () => {
            const app = await make({ rateLimitMax: 1 });
            for (let i = 0; i < 3; i += 1) {
                const res = await hit(app, {}, i === 2 ? '/healthz?verbose=1' : '/healthz');
                expect(res.statusCode).toBe(200);
                expect(res.headers['x-ratelimit-limit']).toBeUndefined();
            }
        });
        it('honours a custom exempt path list', async () => {
            const app = await make({ rateLimitMax: 1, rateLimitExemptPaths: ['/data'] });
            await hit(app, {}, '/healthz');
            expect((await hit(app, {}, '/healthz')).statusCode).toBe(429);
            expect((await hit(app, {}, '/data')).statusCode).toBe(200);
            expect((await hit(app, {}, '/data')).statusCode).toBe(200);
        });
        it('keys verified users by sub so they do not share an IP bucket', async () => {
            const app = await make({ rateLimitMax: 1 });
            expect((await hit(app, { authorization: `Bearer ${userToken('alice')}` })).statusCode).toBe(200);
            expect((await hit(app, { authorization: `Bearer ${userToken('alice')}` })).statusCode).toBe(429);
            expect((await hit(app, { authorization: `Bearer ${userToken('bob')}` })).statusCode).toBe(200);
            // Anonymous callers from the same IP still have their own bucket.
            expect((await hit(app)).statusCode).toBe(200);
        });
        it('falls back to the client IP for invalid bearer tokens', async () => {
            const app = await make({ rateLimitMax: 1 });
            expect((await hit(app, { authorization: 'Bearer forged.token.value' })).statusCode).toBe(200);
            expect((await hit(app, { authorization: 'Bearer another.forged.token' })).statusCode).toBe(429);
            expect((await hit(app)).statusCode).toBe(429);
        });
        it('falls back to the client IP when no auth plugin is registered', async () => {
            const app = await make({ rateLimitMax: 1 }, { withAuth: false });
            expect((await hit(app, { authorization: `Bearer ${userToken('alice')}` })).statusCode).toBe(200);
            expect((await hit(app, { authorization: `Bearer ${userToken('bob')}` })).statusCode).toBe(429);
        });
        it('keys verified service callers by name with their own (larger) budget', async () => {
            const serviceToken = { secret: INTERNAL_SECRET, issuer: 'zuma-internal', audience: 'wallet-service' };
            const app = await make({ rateLimitMax: 1, rateLimitServiceMax: 3, serviceToken });
            const signer = (0, src_1.createServiceTokenSigner)({
                secret: INTERNAL_SECRET,
                issuer: 'zuma-internal',
                serviceName: 'transaction-service',
            });
            const headers = () => ({ [src_1.SERVICE_TOKEN_HEADER]: signer.sign('wallet-service') });
            const first = await hit(app, headers());
            expect(first.headers['x-ratelimit-limit']).toBe('3');
            expect((await hit(app, headers())).statusCode).toBe(200);
            expect((await hit(app, headers())).statusCode).toBe(200);
            expect((await hit(app, headers())).statusCode).toBe(429);
            // The anonymous IP bucket is untouched.
            expect((await hit(app)).statusCode).toBe(200);
        });
        it('falls back to the IP bucket for an invalid service token', async () => {
            const serviceToken = { secret: INTERNAL_SECRET, issuer: 'zuma-internal', audience: 'wallet-service' };
            const app = await make({ rateLimitMax: 1, rateLimitServiceMax: 10, serviceToken });
            const forged = await hit(app, { [src_1.SERVICE_TOKEN_HEADER]: 'a.b.c' });
            expect(forged.headers['x-ratelimit-limit']).toBe('1');
            expect((await hit(app)).statusCode).toBe(429);
        });
        it('uses the user budget for service callers when no service max is set', async () => {
            const serviceToken = { secret: INTERNAL_SECRET, issuer: 'zuma-internal', audience: 'wallet-service' };
            const app = await make({ rateLimitMax: 2, serviceToken });
            const signer = (0, src_1.createServiceTokenSigner)({ secret: INTERNAL_SECRET, issuer: 'zuma-internal', serviceName: 'x' });
            const res = await hit(app, { [src_1.SERVICE_TOKEN_HEADER]: signer.sign('wallet-service') });
            expect(res.headers['x-ratelimit-limit']).toBe('2');
        });
    });
});
