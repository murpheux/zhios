import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

export interface OtelBootstrapOptions {
  serviceName: string;
  otlpEndpoint?: string;
}

let sdk: NodeSDK | undefined;

// Starts the OpenTelemetry Node SDK for traces; call once at service startup, before the
// modules to instrument (http, fastify, mongoose) are required.
export const startOtel = ({ serviceName, otlpEndpoint }: OtelBootstrapOptions): NodeSDK => {
  if (sdk) return sdk;
  sdk = new NodeSDK({
    serviceName,
    traceExporter: new OTLPTraceExporter({
      url: otlpEndpoint ? `${otlpEndpoint.replace(/\/+$/, '')}/v1/traces` : undefined,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({ '@opentelemetry/instrumentation-fs': { enabled: false } }),
    ],
  });

  sdk.start();
  return sdk;
};

// Starts OTel only when OTEL_EXPORTER_OTLP_ENDPOINT is set; returns whether it started.
export const startOtelFromEnv = (
  defaultServiceName: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean => {
  const otlpEndpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!otlpEndpoint) return false;
  startOtel({
    serviceName: env.OTEL_SERVICE_NAME ?? env.SERVICE_NAME ?? defaultServiceName,
    otlpEndpoint,
  });
  return true;
};

// Flushes pending spans and stops the SDK; no-op if OTel was never started.
export const shutdownOtel = async (): Promise<void> => {
  const current = sdk;
  sdk = undefined;
  await current?.shutdown();
};
