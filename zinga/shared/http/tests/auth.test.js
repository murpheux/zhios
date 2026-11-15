"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const src_1 = require("../src");
const jwt_helpers_1 = require("./jwt-helpers");
const SECRET = 'user-jwt-secret-0123456789';
const ISSUER = 'zuma';
const build = async (overrides = {}) => {
    const app = (0, fastify_1.default)();
    await app.register(src_1.authPlugin, { jwtSecret: SECRET, jwtIssuer: ISSUER, ...overrides });
    app.setErrorHandler(src_1.errorHandler);
    app.get('/me', { preHandler: app.requireAuth }, async (request) => (0, src_1.toActor)(request.user));
    app.get('/admin', { preHandler: [app.requireAuth, app.requireRole('admin')] }, async () => ({ ok: true }));
    // requireRole without requireAuth: request.user is unset, so it must still fail closed.
    app.get('/role-only', { preHandler: app.requireRole('admin') }, async () => ({ ok: true }));
    await app.ready();
    return app;
};
const valid = (extra = {}) => ({
    sub: 'user-1',
    iss: ISSUER,
    exp: (0, jwt_helpers_1.nowSeconds)() + 300,
    ...extra,
});
describe('toActor', () => {
    it.each([
        [{ sub: 'u1' }, { sub: 'u1', roles: [] }],
        [{ sub: 'u2', roles: ['admin'] }, { sub: 'u2', roles: ['admin'] }],
    ])('normalizes %j', (payload, actor) => {
        expect((0, src_1.toActor)(payload)).toEqual(actor);
    });
});
describe('authPlugin (HS256)', () => {
    let app;
    beforeAll(async () => {
        app = await build();
    });
    afterAll(async () => {
        await app.close();
    });
    const call = (url, token) => app.inject({ method: 'GET', url, headers: token ? { authorization: `Bearer ${token}` } : {} });
    it('accepts a valid token and exposes the actor', async () => {
        const res = await call('/me', (0, jwt_helpers_1.signHs256)(valid({ roles: ['auditor'] }), SECRET));
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ sub: 'user-1', roles: ['auditor'] });
    });
    it('accepts tokens minted by app.jwt.sign with the default (issuer-pinned) options', async () => {
        const res = await call('/me', app.jwt.sign({ sub: 'user-2', exp: (0, jwt_helpers_1.nowSeconds)() + 60 }));
        expect(res.json()).toEqual({ sub: 'user-2', roles: [] });
    });
    it.each([
        ['missing token', () => undefined],
        ['garbage token', () => 'not.a.jwt'],
        ['wrong secret', () => (0, jwt_helpers_1.signHs256)(valid(), 'another-secret-0123456789')],
        ['wrong issuer', () => (0, jwt_helpers_1.signHs256)(valid({ iss: 'evil' }), SECRET)],
        ['missing issuer', () => (0, jwt_helpers_1.signHs256)({ sub: 'user-1', exp: (0, jwt_helpers_1.nowSeconds)() + 300 }, SECRET)],
        ['expired', () => (0, jwt_helpers_1.signHs256)(valid({ exp: (0, jwt_helpers_1.nowSeconds)() - 60 }), SECRET)],
        ['missing exp', () => (0, jwt_helpers_1.signHs256)({ sub: 'user-1', iss: ISSUER }, SECRET)],
        ['missing sub', () => (0, jwt_helpers_1.signHs256)({ iss: ISSUER, exp: (0, jwt_helpers_1.nowSeconds)() + 300 }, SECRET)],
        ['alg none', () => (0, jwt_helpers_1.signHs256)(valid(), SECRET, { alg: 'none', typ: 'JWT' }).replace(/\.[^.]+$/, '.')],
        ['alg HS512 (not pinned)', () => (0, jwt_helpers_1.signHs256)(valid(), SECRET, { alg: 'HS512', typ: 'JWT' })],
    ])('401s on %s without leaking the reason', async (_name, makeToken) => {
        const res = await call('/me', makeToken());
        expect(res.statusCode).toBe(401);
        expect(res.json()).toEqual({
            statusCode: 401,
            code: 'UNAUTHORIZED',
            message: 'Invalid or missing authentication token',
        });
    });
    it.each([
        [undefined, 403],
        [['user'], 403],
        [['auditor'], 403],
        [['admin'], 200],
        [['user', 'admin'], 200],
    ])('requireRole(admin) with roles %j -> %d', async (roles, status) => {
        const res = await call('/admin', (0, jwt_helpers_1.signHs256)(valid(roles ? { roles } : {}), SECRET));
        expect(res.statusCode).toBe(status);
        if (status === 403) {
            expect(res.json()).toMatchObject({ code: 'FORBIDDEN', message: "Requires role 'admin'" });
        }
    });
    it('requireRole fails closed when no user is attached', async () => {
        expect((await call('/role-only')).statusCode).toBe(403);
    });
});
describe('authPlugin (HS256 with audience)', () => {
    it.each([
        ['zuma-api', 200],
        ['other-api', 401],
        [undefined, 401],
    ])('aud=%p -> %d', async (aud, status) => {
        const app = await build({ jwtAudience: 'zuma-api' });
        const token = (0, jwt_helpers_1.signHs256)(valid(aud === undefined ? {} : { aud }), SECRET);
        const res = await app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${token}` } });
        expect(res.statusCode).toBe(status);
        await app.close();
    });
});
describe('authPlugin (JWKS misconfiguration)', () => {
    it('refuses to start with a JWKS URI but no audience', async () => {
        const app = (0, fastify_1.default)();
        app.register(src_1.authPlugin, { jwtSecret: SECRET, jwtIssuer: ISSUER, jwksUri: 'https://idp.example.com/jwks' });
        await expect(app.ready()).rejects.toThrow('jwtAudience is required when jwksUri is set');
    });
});
