"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mockSecretsSend = jest.fn();
const mockSsmSend = jest.fn();
const mockConnectMongo = jest.fn().mockResolvedValue(undefined);
const mockBuildApp = jest.fn().mockResolvedValue({ fake: 'app' });
const mockLambdaHandler = jest.fn().mockResolvedValue({ statusCode: 200 });
const mockAwsLambdaFastify = jest.fn(() => mockLambdaHandler);
const mockStartOtelFromEnv = jest.fn();
jest.mock('@aws-sdk/client-secrets-manager', () => ({
    SecretsManagerClient: jest.fn(() => ({ send: mockSecretsSend })),
    GetSecretValueCommand: jest.fn((input) => ({ input })),
}));
jest.mock('@aws-sdk/client-ssm', () => ({
    SSMClient: jest.fn(() => ({ send: mockSsmSend })),
    GetParameterCommand: jest.fn((input) => ({ input })),
}));
jest.mock('@fastify/aws-lambda', () => mockAwsLambdaFastify);
jest.mock('../src/infrastructure/mongo/mongo-connection', () => ({ connectMongo: mockConnectMongo }));
jest.mock('../src/app', () => ({ buildApp: mockBuildApp }));
jest.mock('@zinga/shared-observability', () => ({
    ...jest.requireActual('@zinga/shared-observability'),
    startOtelFromEnv: mockStartOtelFromEnv,
}));
const shared_http_1 = require("@zinga/shared-http");
const wallet_service_config_1 = require("../src/config/wallet-service-config");
const health_1 = __importDefault(require("../src/api/plugins/health"));
const auth_1 = __importStar(require("../src/api/plugins/auth"));
const test_app_1 = require("./fakes/test-app");
describe('wallet-service config', () => {
    it('applies service defaults on top of the base schema', () => {
        const config = (0, wallet_service_config_1.loadWalletServiceConfig)((0, test_app_1.testEnv)());
        expect(config).toMatchObject({ SERVICE_NAME: 'wallet-service', TRANSACTION_SERVICE_URL: 'http://localhost:3002', PORT: 3001 });
    });
    it('enforces the base cross-field rules', () => {
        const shared = 'one-secret-used-for-both-0123456789abcdef';
        expect(() => (0, wallet_service_config_1.loadWalletServiceConfig)((0, test_app_1.testEnv)({ INTERNAL_JWT_SECRET: shared, JWT_SECRET: shared }))).toThrow(/INTERNAL_JWT_SECRET must differ from JWT_SECRET/);
    });
    it('reads process.env by default', () => {
        const original = process.env;
        process.env = { ...(0, test_app_1.testEnv)({ SERVICE_NAME: 'from-process-env' }) };
        try {
            expect((0, wallet_service_config_1.loadWalletServiceConfig)().SERVICE_NAME).toBe('from-process-env');
        }
        finally {
            process.env = original;
        }
    });
});
describe('plugin re-export shims', () => {
    it('re-export the shared plugins', () => {
        expect(health_1.default).toBe(shared_http_1.healthPlugin);
        expect(auth_1.default).toBe(shared_http_1.authPlugin);
        expect(auth_1.toActor).toBe(shared_http_1.toActor);
    });
});
describe('otel entrypoint', () => {
    it('starts OTel from env under the wallet-service name', () => {
        jest.isolateModules(() => {
            require('../src/otel');
        });
        expect(mockStartOtelFromEnv).toHaveBeenCalledWith('wallet-service');
    });
});
describe('lambda handler', () => {
    const ENV_KEYS = [
        'JWT_SECRET_ARN',
        'INTERNAL_JWT_SECRET_ARN',
        'MONGODB_URI_PARAMETER_NAME',
        'JWT_SECRET',
        'INTERNAL_JWT_SECRET',
        'MONGODB_URI',
        'PORT',
    ];
    const saved = {};
    const context = {};
    const loadHandler = () => {
        let handler;
        jest.isolateModules(() => {
            handler = require('../src/lambda-handler').handler;
        });
        return handler;
    };
    beforeEach(() => {
        for (const key of ENV_KEYS) {
            saved[key] = process.env[key];
        }
        const env = (0, test_app_1.testEnv)();
        process.env.PORT = env.PORT;
        process.env.MONGODB_URI = env.MONGODB_URI;
        process.env.JWT_SECRET = env.JWT_SECRET;
        process.env.INTERNAL_JWT_SECRET = env.INTERNAL_JWT_SECRET;
        delete process.env.JWT_SECRET_ARN;
        delete process.env.INTERNAL_JWT_SECRET_ARN;
        delete process.env.MONGODB_URI_PARAMETER_NAME;
        jest.clearAllMocks();
    });
    afterEach(() => {
        for (const key of ENV_KEYS) {
            if (saved[key] === undefined) {
                delete process.env[key];
            }
            else {
                process.env[key] = saved[key];
            }
        }
    });
    it('builds the app once (cold start) and reuses it for warm invocations', async () => {
        const handler = loadHandler();
        await handler({ path: '/healthz' }, context, () => undefined);
        await handler({ path: '/readyz' }, context, () => undefined);
        expect(mockConnectMongo).toHaveBeenCalledTimes(1);
        expect(mockConnectMongo).toHaveBeenCalledWith('mongodb://unused:27017/zuma', expect.anything(), { maxPoolSize: 5, serverSelectionTimeoutMS: 5000 });
        expect(mockBuildApp).toHaveBeenCalledTimes(1);
        expect(mockAwsLambdaFastify).toHaveBeenCalledWith({ fake: 'app' });
        expect(mockLambdaHandler).toHaveBeenCalledTimes(2);
        expect(mockSecretsSend).not.toHaveBeenCalled();
        expect(mockSsmSend).not.toHaveBeenCalled();
    });
    it('hydrates secrets from Secrets Manager and the Mongo URI from SSM (decrypted) when configured', async () => {
        process.env.JWT_SECRET_ARN = 'arn:jwt';
        process.env.INTERNAL_JWT_SECRET_ARN = 'arn:internal';
        process.env.MONGODB_URI_PARAMETER_NAME = '/zuma/mongo-uri';
        mockSecretsSend.mockImplementation(async ({ input }) => ({
            SecretString: input.SecretId === 'arn:jwt' ? 'hydrated-user-secret-0123456789' : 'hydrated-internal-secret-0123456789abcdef',
        }));
        mockSsmSend.mockResolvedValue({ Parameter: { Value: 'mongodb://from-ssm:27017/zuma' } });
        await loadHandler()({}, context, () => undefined);
        expect(mockSecretsSend).toHaveBeenCalledTimes(2);
        expect(mockSsmSend).toHaveBeenCalledWith({ input: { Name: '/zuma/mongo-uri', WithDecryption: true } });
        expect(process.env.JWT_SECRET).toBe('hydrated-user-secret-0123456789');
        expect(process.env.INTERNAL_JWT_SECRET).toBe('hydrated-internal-secret-0123456789abcdef');
        expect(mockConnectMongo.mock.calls[0][0]).toBe('mongodb://from-ssm:27017/zuma');
    });
    it('keeps the existing MONGODB_URI when the SSM parameter is empty', async () => {
        process.env.MONGODB_URI_PARAMETER_NAME = '/zuma/mongo-uri';
        mockSsmSend.mockResolvedValue({ Parameter: {} });
        await loadHandler()({}, context, () => undefined);
        expect(mockConnectMongo.mock.calls[0][0]).toBe('mongodb://unused:27017/zuma');
    });
    it('fails the cold start when a secret has no SecretString', async () => {
        process.env.JWT_SECRET_ARN = 'arn:jwt';
        mockSecretsSend.mockResolvedValue({});
        await expect(loadHandler()({}, context, () => undefined)).rejects.toThrow('Secrets Manager secret for JWT_SECRET has no SecretString');
        expect(mockBuildApp).not.toHaveBeenCalled();
    });
});
