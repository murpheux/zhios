#!/usr/bin/env node
/**
 * esbuild configuration and build script for ozzo microservice.
 * Usage: node esbuild.config.js
 */

const esbuild = require('esbuild');

const externalModules = [
  // Runtime dependencies - don't bundle
  '@fastify/swagger',
  '@prisma/client',
  '@scalar/fastify-api-reference',
  'fastify',
  'fastify-plugin',
  'ioredis',
  'jose',
  'newrelic',
  'pino',
  'pino-pretty',
  'pino-roll',
  'prisma',
  'zod',
  'axios',
  // OpenTelemetry packages
  '@opentelemetry/api',
  '@opentelemetry/sdk-node',
  '@opentelemetry/auto-instrumentations-node',
  '@opentelemetry/exporter-trace-otlp-http',
  '@opentelemetry/sdk-trace-node',
  '@opentelemetry/resources',
  '@opentelemetry/semantic-conventions',
  '@opentelemetry/instrumentation-fastify',
  '@opentelemetry/instrumentation-http',
  '@opentelemetry/instrumentation-pg',
  '@opentelemetry/instrumentation-redis',
  // Node.js built-ins
  'fs',
  'path',
  'http',
  'https',
  'stream',
  'events',
  'crypto',
  'util',
  'os',
  'child_process',
];

async function build() {
  try {
    await esbuild.build({
      entryPoints: ['src/index.ts'],
      outfile: 'dist/index.js',
      bundle: true,
      platform: 'node',
      target: 'node22',
      external: externalModules,
      sourcemap: true,
      minify: false,
      logLevel: 'info',
      packages: 'external', // Treat all require() of node_modules as external
    });
    console.log('✓ Bundle built successfully');
  } catch (error) {
    console.error('✗ Build failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  build();
}

module.exports = { build };
