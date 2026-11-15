"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const src_1 = require("../src");
// Emitted in-process only (process.emit calls listeners; no real signal is delivered).
const SIGNALS = ['SIGUSR2', 'SIGWINCH'];
const flush = () => new Promise((resolve) => setImmediate(resolve));
const fakeApp = (close = () => Promise.resolve()) => {
    const app = {
        close: jest.fn(close),
        log: { info: jest.fn(), error: jest.fn() },
    };
    return app;
};
describe('registerGracefulShutdown', () => {
    let exit;
    beforeEach(() => {
        exit = jest.spyOn(process, 'exit').mockImplementation((() => undefined));
    });
    afterEach(() => {
        for (const signal of SIGNALS) {
            process.removeAllListeners(signal);
        }
        exit.mockRestore();
        jest.useRealTimers();
    });
    it('closes the app, runs hooks in order, then exits 0', async () => {
        const order = [];
        const app = fakeApp(async () => {
            order.push('close');
        });
        (0, src_1.registerGracefulShutdown)({
            app,
            signals: SIGNALS,
            onClose: [async () => void order.push('mongo'), async () => void order.push('otel')],
        });
        process.emit('SIGUSR2');
        await flush();
        expect(order).toEqual(['close', 'mongo', 'otel']);
        expect(app.log.info).toHaveBeenCalledWith({ signal: 'SIGUSR2' }, 'shutting down');
        expect(exit).toHaveBeenCalledWith(0);
    });
    it('exits 1 when app.close fails but still runs the hooks', async () => {
        const hook = jest.fn().mockResolvedValue(undefined);
        const app = fakeApp(() => Promise.reject(new Error('close failed')));
        (0, src_1.registerGracefulShutdown)({ app, signals: SIGNALS, onClose: [hook] });
        process.emit('SIGUSR2');
        await flush();
        expect(hook).toHaveBeenCalled();
        expect(app.log.error).toHaveBeenCalledWith(expect.objectContaining({ err: expect.any(Error) }), 'error closing HTTP server');
        expect(exit).toHaveBeenCalledWith(1);
    });
    it('runs every hook even if an earlier one fails, and exits 1', async () => {
        const second = jest.fn().mockResolvedValue(undefined);
        const app = fakeApp();
        (0, src_1.registerGracefulShutdown)({
            app,
            signals: SIGNALS,
            onClose: [() => Promise.reject(new Error('mongo')), second],
        });
        process.emit('SIGUSR2');
        await flush();
        expect(second).toHaveBeenCalled();
        expect(app.log.error).toHaveBeenCalledWith(expect.anything(), 'error during shutdown hook');
        expect(exit).toHaveBeenCalledWith(1);
    });
    it('shuts down only once when several signals arrive', async () => {
        const app = fakeApp();
        (0, src_1.registerGracefulShutdown)({ app, signals: SIGNALS });
        process.emit('SIGUSR2');
        process.emit('SIGWINCH');
        await flush();
        expect(app.close).toHaveBeenCalledTimes(1);
        expect(exit).toHaveBeenCalledTimes(1);
    });
    it('forces exit(1) when shutdown exceeds the timeout', async () => {
        jest.useFakeTimers();
        const app = fakeApp(() => new Promise(() => undefined));
        (0, src_1.registerGracefulShutdown)({ app, signals: SIGNALS, timeoutMs: 500 });
        process.emit('SIGUSR2');
        jest.advanceTimersByTime(499);
        expect(exit).not.toHaveBeenCalled();
        jest.advanceTimersByTime(1);
        expect(app.log.error).toHaveBeenCalledWith({ timeoutMs: 500 }, 'graceful shutdown timed out; forcing exit');
        expect(exit).toHaveBeenCalledWith(1);
    });
    it('listens on SIGTERM and SIGINT by default with a 10s deadline', () => {
        const before = { term: process.listenerCount('SIGTERM'), int: process.listenerCount('SIGINT') };
        (0, src_1.registerGracefulShutdown)({ app: fakeApp() });
        expect(process.listenerCount('SIGTERM')).toBe(before.term + 1);
        expect(process.listenerCount('SIGINT')).toBe(before.int + 1);
        // Remove only the listeners added here.
        const term = process.listeners('SIGTERM').at(-1);
        const int = process.listeners('SIGINT').at(-1);
        if (term) {
            process.removeListener('SIGTERM', term);
        }
        if (int) {
            process.removeListener('SIGINT', int);
        }
    });
});
