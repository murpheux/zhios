# esbuild Configuration for Ozzo Microservice

## Overview

The ozzo microservice uses **esbuild** for fast, efficient bundling instead of TypeScript's `tsc` compiler. This provides significant performance improvements while maintaining full TypeScript support and type-checking.

## Why esbuild?

- **Speed:** esbuild builds 10-100x faster than tsc, critical for CI/CD pipelines
- **Bundle size:** Efficient tree-shaking and dead-code elimination
- **Simplicity:** Single-pass transpilation without intermediate steps
- **Node.js optimized:** Direct platform/node target for streamlined output

## Build Configuration

### Setup

The build system is configured in `/ozzo/esbuild.config.js` and invoked via:

```bash
npm run build        # esbuild bundle + typecheck (full build)
npm run build:bundle # esbuild bundle only (faster, skips types)
npm start            # Run bundled dist/index.js
```

### External Dependencies (Not Bundled)

The following packages are marked as external and loaded at runtime:

**Runtime Dependencies:**
- `@fastify/swagger`, `@prisma/client`, `@scalar/fastify-api-reference`
- `fastify`, `fastify-plugin`, `ioredis`, `jose`
- `newrelic`, `pino`, `pino-pretty`, `pino-roll`
- `prisma`, `zod`, `axios`

**OpenTelemetry Instrumentation:**
- `@opentelemetry/*` (all subpackages)

**Rationale:**
- **Native modules:** PostgreSQL driver (`pg`), Redis (`ioredis`) need system libraries
- **Large packages:** New Relic, Prisma are heavy; bundling bloats output
- **Runtime loading:** OpenTelemetry instrument Node.js at startup; bundling breaks auto-instrumentation hooks
- **Plugin systems:** Fastify plugins resolve from node_modules; bundling breaks plugin discovery

## Build Output

```
dist/
├── index.js              # Single bundled entry point (~1.5-2.0 MB uncompressed)
├── index.js.map          # TypeScript source maps for debugging
└── (all dependencies are in node_modules/)
```

**Expected sizes:**
- Bundled JS: ~1.5-2.0 MB
- Gzipped: ~350-550 KB
- Total image with deps: ~300-400 MB (uncompressed Docker image layer)

## Type Checking

TypeScript type checking runs separately after bundling:

```bash
npm run typecheck  # Run tsc --noEmit (type checking only, no output)
```

This ensures type safety while esbuild handles transpilation. Full `npm run build` runs both in sequence.

## Docker Build

The `infrastructure/docker/ozzo.Dockerfile` builder stage:

1. Installs dependencies: `npm ci`
2. Generates Prisma client: `npx prisma generate`
3. Runs esbuild bundle: `npm run build` (includes typecheck)
4. Prod stage copies only `dist/index.js` + `node_modules` (no src/)

Build time is dominated by `npm ci` and Prisma generation; esbuild adds <1s.

## Configuration Details

**Target:** `node22` (matches `engines: node >=22` in package.json)

**Platform:** `node` (CommonJS, not browser)

**Sourcemaps:** Enabled (`sourcemap: true`) for production debugging

**Minification:** Disabled (`minify: false`) to keep stack traces readable

**Packages handling:** `packages: 'external'` — all `require()` calls that resolve to node_modules are excluded from the bundle

## Local Development

During local development, use `npm run dev` for live-reload:

```bash
npm run dev  # Runs: tsx watch src/index.ts
```

This skips bundling and runs TypeScript directly through `tsx`, ideal for iteration.

For testing the bundled version locally:

```bash
npm run build          # Full build with typecheck
npm start              # Run bundled code
curl http://localhost:3004/healthz
```

## Troubleshooting

### Bundle is too large

Check what's being included:
```bash
npm run build:bundle  # Bundle only (faster for testing)
ls -lh dist/index.js
```

If >2.5 MB, review the external list in `esbuild.config.js`. Common culprits:
- Missing package in external list (check `npm ls <pkg>`)
- Transitive dependencies of externals being bundled (esbuild will warn)

### `require()` fails at runtime

If a runtime dependency is missing at startup:
1. Check it's in `package.json` `dependencies` (not `devDependencies`)
2. Verify it's in the external list in `esbuild.config.js`
3. Ensure `npm ci --omit=dev` in prod-deps stage includes it

### Type errors after bundling

Type errors are caught by `npm run typecheck` before bundling. If types pass but runtime fails:
- Run `npm run typecheck` explicitly to validate
- Check that all imported modules are actually available in node_modules

## Performance Metrics

**Build times (local):**
- `npm run build:bundle`: ~0.5s
- `npm run typecheck`: ~2-3s
- Full `npm run build`: ~3s

**Docker build (builder stage):**
- `npm ci`: ~30s (cached)
- `npx prisma generate`: ~2-3s
- `npm run build`: ~3s
- Total: ~35s (dominated by npm ci cache misses and Prisma)

**Runtime:**
- Startup time: <500ms (Prisma client initialization)
- Bundle loads as single module; no module resolution overhead

## References

- [esbuild documentation](https://esbuild.github.io/)
- [Node.js 22 APIs](https://nodejs.org/docs/latest-v22.x/api/)
- Ozzo Architecture: `/docs/architecture.md`
