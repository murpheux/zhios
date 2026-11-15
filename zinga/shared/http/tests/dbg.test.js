"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Regression: the JWKS secret callback must receive the decoded token header (kid). Before the fix the
// plugin registered @fastify/jwt without `decode.complete`, so every OIDC token was rejected.
const mockGetSigningKey = jest.fn();
jest.mock('jwks-rsa', () => jest.fn(() => ({ getSigningKey: mockGetSigningKey, getSigningKeys: jest.fn().mockResolvedValue([]) })));
const fastify_1 = __importDefault(require("fastify"));
const src_1 = require("../src");
const jwt_helpers_1 = require("./jwt-helpers");
it('passes the token kid to the JWKS key resolver', async () => {
    const { publicKey, privateKey } = (0, jwt_helpers_1.generateRsaKeyPair)();
    mockGetSigningKey.mockResolvedValue({ getPublicKey: () => publicKey });
    const app = (0, fastify_1.default)();
    await app.register(src_1.authPlugin, {
        jwtSecret: 'unused-secret-0123456789',
        jwtIssuer: 'iss',
        jwksUri: 'https://idp.example.com/jwks',
        jwtAudience: 'aud',
    });
    app.get('/me', async (request) => request.jwtVerify());
    const token = (0, jwt_helpers_1.signRs256)({ sub: 's', iss: 'iss', aud: 'aud', exp: (0, jwt_helpers_1.nowSeconds)() + 100 }, privateKey, {
        alg: 'RS256',
        typ: 'JWT',
        kid: 'rotating-key-7',
    });
    const res = await app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    expect(mockGetSigningKey).toHaveBeenCalledWith('rotating-key-7');
    await app.close();
});
