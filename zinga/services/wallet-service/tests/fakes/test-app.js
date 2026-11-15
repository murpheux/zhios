"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildTestApp = exports.testEnv = exports.ALLOWED_ORIGIN = exports.INTERNAL_JWT_SECRET = exports.JWT_SECRET = void 0;
const pino_1 = __importDefault(require("pino"));
const shared_http_1 = require("@zinga/shared-http");
const app_1 = require("../../src/app");
const wallet_service_config_1 = require("../../src/config/wallet-service-config");
const in_memory_repositories_1 = require("./in-memory-repositories");
// Test files that use buildTestApp must replace the PostgreSQL adapters with the in-memory fakes:
//
//   jest.mock('../../src/infrastructure/persistence/wallet.repository', () => ({
//     PostgresWalletRepository: jest.requireActual('../fakes/in-memory-repositories').InMemoryWalletRepository,
//   }));
//   (same for ledger.repository / transaction-history.client)
exports.JWT_SECRET = 'test-user-jwt-secret-0123456789';
exports.INTERNAL_JWT_SECRET = 'test-internal-jwt-secret-0123456789abcdef';
exports.ALLOWED_ORIGIN = 'https://app.example.com';
const testEnv = (overrides = {}) => ({
    PORT: '3001',
    DATABASE_URL: 'postgresql://unused:unused@localhost:5432/zinga-test',
    JWT_SECRET: exports.JWT_SECRET,
    INTERNAL_JWT_SECRET: exports.INTERNAL_JWT_SECRET,
    NODE_ENV: 'test',
    METRICS_ENABLED: 'false',
    DOCS_ENABLED: 'false',
    CORS_ALLOWED_ORIGINS: exports.ALLOWED_ORIGIN,
    LEDGER_VERIFICATION_ENABLED: 'true',
    LEDGER_VERIFICATION_INTERVAL_MS: '3600000',
    TAMPER_DETECTION_ENABLED: 'true',
    TAMPER_DETECTION_LOG_ERRORS: 'true',
    ...overrides,
});
exports.testEnv = testEnv;
// Mock pgPool for testing (repositories are mocked, so this pool is never actually used)
const mockPgPool = {
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn(),
};
const buildTestApp = async (envOverrides = {}) => {
    const config = (0, wallet_service_config_1.loadWalletServiceConfig)((0, exports.testEnv)(envOverrides));
    const app = await (0, app_1.buildApp)({ config, logger: (0, pino_1.default)({ level: 'silent' }), pgPool: mockPgPool });
    await app.ready();
    const wallets = in_memory_repositories_1.InMemoryWalletRepository.last;
    const ledger = in_memory_repositories_1.InMemoryLedgerRepository.last;
    const history = in_memory_repositories_1.FakeTransactionHistoryClient.last;
    const bearer = (sub, roles = []) => ({
        authorization: `Bearer ${app.jwt.sign({ sub, roles, exp: Math.floor(Date.now() / 1000) + 300 })}`,
    });
    const serviceHeaders = (caller, audience = 'wallet-service') => ({
        'x-service-token': (0, shared_http_1.createServiceTokenSigner)({
            secret: exports.INTERNAL_JWT_SECRET,
            issuer: 'zuma-internal',
            serviceName: caller,
        }).sign(audience),
    });
    return { app, config, wallets, ledger, history, bearer, serviceHeaders };
};
exports.buildTestApp = buildTestApp;
