#!/usr/bin/env node

/**
 * esbuild configuration for zinga wallet-service
 *
 * WHY ESBUILD?
 * - TypeScript compilation with bundling in a single pass (vs tsc which just transpiles)
 * - ~10-50x faster builds than tsc + bundler combinations
 * - Produces a single, tree-shaken dist/index.js suitable for Lambda and containerized deployments
 * - Zero configuration needed for path aliases (esbuild handles tsconfig.json paths natively)
 *
 * EXTERNAL DEPENDENCIES (not bundled, expected at runtime):
 * - `pg` — PostgreSQL client (native bindings; must match host Node version)
 * - `pino*` — Logging library (plugins and transports loaded dynamically)
 * - `@opentelemetry/*` — Observability (auto-instrumentation and exporters)
 * - `@aws-sdk/*` — AWS SDK (large library; lazy-loads modules by service)
 * - `@types/*`, `biome` — Type definitions and linter (dev-only, never bundled)
 *
 * BUNDLED:
 * - Application code (services/wallet-service/src/*)
 * - Shared workspaces (@zinga/shared-*)
 * - All other production dependencies (fastify, zod, etc.)
 * - Source maps for debugging
 */

import * as esbuild from 'esbuild';

const isWatch = process.argv.includes('--watch');
const isDev = process.env.NODE_ENV === 'development' || isWatch;

/**
 * External modules that should NOT be bundled.
 * These are either:
 * - Native bindings (pg) that must match the runtime Node version
 * - Large monolithic libraries with dynamic module loading (@aws-sdk/*, @opentelemetry/*)
 * - Plugin ecosystems (pino plugins and transports)
 * - Node.js builtins (util, net, fs, http, etc. — avoid bundling for runtime compatibility)
 * - Type definitions (always external)
 */
const external = [
  // Node.js builtins (essential to avoid bundling for runtime compatibility)
  'assert',
  'async_hooks',
  'buffer',
  'child_process',
  'cluster',
  'console',
  'constants',
  'crypto',
  'dgram',
  'diagnostics_channel',
  'dns',
  'domain',
  'events',
  'fs',
  'fs/promises',
  'http',
  'http2',
  'https',
  'inspector',
  'net',
  'os',
  'path',
  'perf_hooks',
  'process',
  'punycode',
  'querystring',
  'readline',
  'repl',
  'stream',
  'stream/promises',
  'stream/web',
  'string_decoder',
  'sys',
  'timers',
  'timers/promises',
  'tls',
  'trace_events',
  'tty',
  'url',
  'util',
  'v8',
  'vm',
  'wasi',
  'worker_threads',
  'zlib',

  // Database drivers
  'pg',
  'pg-pool',
  'pg/lib/native',
  'pg/lib/pool',

  // Logging
  'pino',
  'pino-pretty',
  'pino-roll',
  'pino/file',
  'pino-http',

  // Observability
  '@opentelemetry/api',
  '@opentelemetry/sdk-node',
  '@opentelemetry/sdk-trace-node',
  '@opentelemetry/resources',
  '@opentelemetry/semantic-conventions',
  '@opentelemetry/exporter-trace-otlp-http',
  '@opentelemetry/auto-instrumentations-node',
  '@opentelemetry/instrumentation-fs',
  '@opentelemetry/instrumentation-http',
  '@opentelemetry/instrumentation-express',

  // AWS SDK (lazy-loads services)
  '@aws-sdk/client-secrets-manager',
  '@aws-sdk/client-ssm',
  '@aws-sdk/lib-dynamodb',

  // Type definitions (dev-only)
  '@types/node',
  '@types/pg',
  '@types/jest',

  // Linter (dev-only)
  '@biomejs/biome',
  'biome',
];

/**
 * @type {import('esbuild').BuildOptions}
 */
const buildOptions = {
  entryPoints: ['services/wallet-service/src/index.ts'],
  outfile: 'dist/index.cjs', // .cjs extension since package.json has "type": "module"
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs', // CommonJS for better compatibility with bundled deps using dynamic require()
  external,
  sourcemap: isDev ? 'both' : 'inline', // inline in prod, both for dev debugging
  minify: !isDev,
  sourcesContent: isDev,

  // Resolves tsconfig.json path aliases (@zinga/*, etc.)
  tsconfig: './tsconfig.json',

  // Preserve relative imports for shared workspaces to avoid circular deps
  // at runtime if any shared module is lazy-loaded
  preserveSymlinks: false,

  // Node.js-specific: don't polyfill Node.js builtins
  banner: {
    js: `/**
 * Zinga Wallet Service
 * Bundled with esbuild — single-file deployment for Lambda, Docker, and standalone Node.js
 *
 * Includes: application code + shared workspaces (@zinga/shared-*)
 * External: pg, pino, @opentelemetry/*, @aws-sdk/* (must be installed at runtime)
 */`,
  },

  logLevel: 'info',
};

(async () => {
  if (isWatch) {
    const ctx = await esbuild.context(buildOptions);
    const { serve } = await ctx.serve({
      servedir: '.',
    });
    console.log('Watching for changes and serving on http://localhost:3000');
  } else {
    await esbuild.build(buildOptions);
    console.log('✓ Build complete: dist/index.cjs');
  }
})().catch((error) => {
  console.error('Build failed:', error);
  process.exit(1);
});
