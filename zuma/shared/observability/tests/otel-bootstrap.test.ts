const mockStart = jest.fn();
const mockShutdown = jest.fn().mockResolvedValue(undefined);
const mockNodeSdk = jest.fn().mockImplementation(() => ({ start: mockStart, shutdown: mockShutdown }));
const mockExporter = jest.fn().mockImplementation((opts: unknown) => ({ opts }));
const mockInstrumentations = jest.fn().mockReturnValue(['auto']);

jest.mock('@opentelemetry/sdk-node', () => ({ NodeSDK: mockNodeSdk }));
jest.mock('@opentelemetry/exporter-trace-otlp-http', () => ({ OTLPTraceExporter: mockExporter }));
jest.mock('@opentelemetry/auto-instrumentations-node', () => ({
  getNodeAutoInstrumentations: mockInstrumentations,
}));

import { shutdownOtel, startOtel, startOtelFromEnv } from '../src/otel-bootstrap';

describe('otel bootstrap', () => {
  afterEach(async () => {
    await shutdownOtel();
    jest.clearAllMocks();
  });

  it('starts the SDK once with the OTLP traces URL (trailing slashes stripped) and fs instrumentation off', () => {
    const sdk = startOtel({ serviceName: 'wallet-service', otlpEndpoint: 'http://collector:4318//' });
    expect(startOtel({ serviceName: 'other' })).toBe(sdk);
    expect(mockNodeSdk).toHaveBeenCalledTimes(1);
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(mockExporter).toHaveBeenCalledWith({ url: 'http://collector:4318/v1/traces' });
    expect(mockInstrumentations).toHaveBeenCalledWith({ '@opentelemetry/instrumentation-fs': { enabled: false } });
    expect(mockNodeSdk.mock.calls[0][0]).toMatchObject({ serviceName: 'wallet-service', instrumentations: [['auto']] });
  });

  it('lets the exporter use its default URL when no endpoint is given', () => {
    startOtel({ serviceName: 'svc' });
    expect(mockExporter).toHaveBeenCalledWith({ url: undefined });
  });

  it('shutdownOtel stops a running SDK, then is a no-op', async () => {
    startOtel({ serviceName: 'svc' });
    await shutdownOtel();
    await shutdownOtel();
    expect(mockShutdown).toHaveBeenCalledTimes(1);
  });

  it('shutdownOtel is a no-op when never started', async () => {
    await shutdownOtel();
    expect(mockShutdown).not.toHaveBeenCalled();
  });

  describe('startOtelFromEnv', () => {
    it('does nothing without OTEL_EXPORTER_OTLP_ENDPOINT', () => {
      expect(startOtelFromEnv('svc', {})).toBe(false);
      expect(mockNodeSdk).not.toHaveBeenCalled();
    });

    it.each<[Record<string, string>, string]>([
      [{ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://c:4318' }, 'default-name'],
      [{ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://c:4318', SERVICE_NAME: 'from-service-name' }, 'from-service-name'],
      [
        { OTEL_EXPORTER_OTLP_ENDPOINT: 'http://c:4318', SERVICE_NAME: 'x', OTEL_SERVICE_NAME: 'from-otel' },
        'from-otel',
      ],
    ])('starts with the resolved service name (%j)', (env, serviceName) => {
      expect(startOtelFromEnv('default-name', env)).toBe(true);
      expect(mockNodeSdk.mock.calls[0][0]).toMatchObject({ serviceName });
    });

    it('reads process.env by default', () => {
      const original = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
      delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
      try {
        expect(startOtelFromEnv('svc')).toBe(false);
      } finally {
        if (original !== undefined) process.env.OTEL_EXPORTER_OTLP_ENDPOINT = original;
      }
    });
  });
});
