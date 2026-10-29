import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

export interface OtelBootstrapOptions {
  serviceName: string;
  otlpEndpoint?: string;
}

let sdk: NodeSDK | undefined;

// Starts the OpenTelemetry Node SDK for traces; call once at service startup.
export const startOtel = ({ serviceName, otlpEndpoint }: OtelBootstrapOptions): NodeSDK => {
  sdk = new NodeSDK({
    serviceName,
    traceExporter: new OTLPTraceExporter({
      url: otlpEndpoint ? `${otlpEndpoint}/v1/traces` : undefined,
    }),
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();
  return sdk;
};

export const shutdownOtel = async (): Promise<void> => {
  await sdk?.shutdown();
};
