const esbuild = require('esbuild');
const path = require('path');

const external = [
  // Database drivers
  'mongodb',
  'mongoose',
  'pg',
  // Logging
  'pino',
  'pino-pretty',
  // APM / Monitoring
  'newrelic',
  // OpenTelemetry
  '@opentelemetry/api',
  '@opentelemetry/sdk-node',
  '@opentelemetry/auto-instrumentations-node',
  '@opentelemetry/exporter-trace-otlp-http',
  '@opentelemetry/sdk-trace-node',
  '@opentelemetry/resources',
  '@opentelemetry/semantic-conventions',
  // AWS SDK
  '@aws-sdk/client-secrets-manager',
  '@aws-sdk/client-ssm',
  // Fastify plugins that require native modules or complex setup
  '@fastify/aws-lambda',
  // Type declarations (should not be bundled)
  '@types/node',
  '@types/jest',
];

const commonOptions = {
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  sourcesContent: true,
  logLevel: 'info',
  external,
};

const services = [
  {
    name: 'transaction-service',
    entry: 'services/transaction-service/src/index.ts',
    output: 'dist/transaction-service.js',
  },
  {
    name: 'wallet-service',
    entry: 'services/wallet-service/src/index.ts',
    output: 'dist/wallet-service.js',
  },
  {
    name: 'graphql-gateway',
    entry: 'graphql/src/index.ts',
    output: 'dist/graphql-gateway.js',
  },
];

async function build() {
  try {
    for (const service of services) {
      console.log(`\n📦 Building ${service.name}...`);
      await esbuild.build({
        ...commonOptions,
        entryPoints: [path.resolve(__dirname, service.entry)],
        outfile: path.resolve(__dirname, service.output),
        bundle: true,
        minify: false,
      });
      console.log(`✅ ${service.name} built → ${service.output}`);
    }
    console.log('\n✨ All services bundled successfully!');
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  build();
}

module.exports = { services, commonOptions };
