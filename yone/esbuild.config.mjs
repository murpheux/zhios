import esbuild from 'esbuild';

const isProduction = process.env.NODE_ENV === 'production';

await esbuild.build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  external: [
    // Core dependencies that should NOT be bundled
    'pino',
    'pino-pretty',
    'pino-roll',
    'fastify',
    '@fastify/cors',
    '@fastify/helmet',
    '@fastify/rate-limit',
    'newrelic',
    'zod',
    // Do not bundle node internals
    'node:*',
  ],
  minify: isProduction,
  logLevel: 'info',
});

console.log('✓ yone bundle created: dist/index.js');
