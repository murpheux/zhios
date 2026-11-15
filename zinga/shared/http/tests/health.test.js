"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const src_1 = require("../src");
describe('healthPlugin', () => {
    const build = async (checks) => {
        const app = (0, fastify_1.default)();
        await app.register(src_1.healthPlugin, { checks, checkTimeoutMs: 50 });
        await app.ready();
        return app;
    };
    it('/healthz is always ok', async () => {
        const app = await build([() => Promise.reject(new Error('db down'))]);
        const res = await app.inject({ method: 'GET', url: '/healthz' });
        expect(res.statusCode).toBe(200);
        await app.close();
    });
    it('/readyz is 200 when all checks pass', async () => {
        const app = await build([() => Promise.resolve()]);
        const res = await app.inject({ method: 'GET', url: '/readyz' });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ status: 'ok' });
        await app.close();
    });
    it('/readyz is 503 without leaking the reason when a check fails or times out', async () => {
        const app = await build([
            () => Promise.reject(new Error('secret-host:27017 refused')),
            () => new Promise(() => undefined),
        ]);
        const res = await app.inject({ method: 'GET', url: '/readyz' });
        expect(res.statusCode).toBe(503);
        expect(res.body).not.toContain('secret-host');
        await app.close();
    });
});
