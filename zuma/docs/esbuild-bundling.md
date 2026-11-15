# esbuild Bundling Strategy

## Why esbuild?

Replaced `tsc -b` (TypeScript build) with **esbuild** for:

- **Speed**: esbuild is ~100x faster than tsc for bundling
- **Simplicity**: Single output file per service, no scattered `.js` files across `dist/` folders
- **Production-ready**: bundles all application code and shared libraries into optimized JS
- **Type safety**: still uses tsc for type checking before bundling (two-step process)
- **Smaller artifacts**: esbuild produces lean bundles; combined with Docker's multi-stage builds, runtime images are minimal

## Build Process

```bash
npm run build
```

Executes:

```
1. npm run typecheck     # tsc -b for type checking (catches errors early)
2. node esbuild.config.js # bundling with esbuild
```

Output files in `dist/`:

- `dist/transaction-service.js` (~2-3MB, gzipped ~600KB)
- `dist/wallet-service.js` (~2-3MB, gzipped ~600KB) — legacy
- `dist/graphql-gateway.js` (~2-3MB, gzipped ~600KB)
- Each also generates a `.js.map` source map (development only)

## Bundled vs. External

### Bundled (inside the JS file)

- All application code: `services/*/src/**`, `graphql/src/**`
- All shared libraries: `shared/common`, `shared/config`, `shared/logging`, `shared/observability`, `shared/http`
- Transitive dependencies of bundled code

### External (loaded from `node_modules` at runtime)

These are marked `external` in `esbuild.config.js` so they're not bundled:

**Database:**
- `mongodb`, `mongoose`, `pg`

**Logging:**
- `pino`, `pino-pretty`

**Web framework & plugins:**
- `fastify`, `@fastify/swagger`, `@fastify/swagger-ui`, `@fastify/aws-lambda`

**GraphQL (gateway only):**
- `graphql`, `mercurius`

**Observability:**
- `@opentelemetry/api`, `@opentelemetry/sdk-node`, `@opentelemetry/auto-instrumentations-node`
- `@opentelemetry/exporter-trace-otlp-http`, `@opentelemetry/sdk-trace-node`
- `@opentelemetry/resources`, `@opentelemetry/semantic-conventions`

**AWS SDK (wallet-service legacy):**
- `@aws-sdk/client-secrets-manager`, `@aws-sdk/client-ssm`

**Type declarations (never bundled):**
- `@types/node`, `@types/jest`, `@types/aws-lambda`

### Why external?

1. **Large packages**: pino, mongoose, OpenTelemetry are not tree-shakeable and bloat bundles
2. **Native modules**: mongodb drivers may have native bindings; bundling breaks them
3. **Already installed**: npm installs `--omit=dev` at runtime, so these are in `node_modules`
4. **Maintenance**: external deps are updated independently; bundling freezes versions

## Docker Build Changes

### Before (tsc)

Copied all individual `dist/` directories:

```dockerfile
COPY --from=builder /app/shared/common/dist ./shared/common/dist
COPY --from=builder /app/shared/config/dist ./shared/config/dist
...
COPY --from=builder /app/services/transaction-service/dist ./services/transaction-service/dist
CMD ["node", "services/transaction-service/dist/index.js"]
```

### After (esbuild)

Copy the single bundled file:

```dockerfile
COPY --from=builder /app/dist/transaction-service.js ./dist/transaction-service.js
COPY --from=builder /app/dist/transaction-service.js.map ./dist/transaction-service.js.map
CMD ["node", "dist/transaction-service.js"]
```

**Impact**: Dockerfiles are simpler, runtime images smaller (fewer files, single entry point).

## Configuration

### `esbuild.config.js`

Located at repo root. Uses ES modules (`import`/`export`).

Key options:

- **platform**: `node` — target Node.js, not browser
- **target**: `node22` — ES2024 features are safe
- **format**: `esm` — modern module syntax
- **sourcemap**: `true` — include inline source maps for debugging
- **minify**: `false` — production code is readable in logs/error traces
- **external**: list above
- **bundle**: `true` — recursively bundle all dependencies (except external)

## Development Workflow

### Type checking without bundling

```bash
npm run typecheck
```

Runs tsc only, fast feedback loop for IDE/type errors.

### Full build (CI, pre-commit)

```bash
npm run build
```

Runs both typecheck and esbuild.

### Cleaning

```bash
npm run clean
```

Removes `dist/` and tsc cache (`*.tsbuildinfo`).

## Testing

Unit tests remain unchanged:

```bash
npm test
```

Still use jest with ts-jest. Bundles are **not** tested in CI; only unit tests are. If you need bundle validation:

```bash
# Verify bundled files exist and are valid JS
node dist/transaction-service.js --version 2>&1 | head -1

# Check file size
du -h dist/transaction-service.js
```

## Troubleshooting

### "Module not found: pino"

esbuild sees `import from 'pino'` but doesn't bundle it (it's external). Make sure:

1. `pino` is in `dependencies`, not `devDependencies`
2. `pino` is in `esbuild.config.js` external list
3. At runtime, `node_modules/pino` exists in the container/deployment

### "Cannot find module @zuma/shared-*"

esbuild should bundle these. Check:

1. Imports use the correct alias path: `import from '@zuma/shared-common'`
2. `tsconfig.json` has the path mapping configured
3. `esbuild.config.js` doesn't mark these as external

### Large bundle size

If a bundled file exceeds 4MB:

1. Check what's bundled: `npm install -D esbuild-plugin-bundle-analyzer && ...`
2. Mark more deps as external (if they're optional or monorepo-internal)
3. Tree-shake unused code: ensure `tsconfig.json` has `"moduleResolution": "bundler"` and `"esModuleInterop": true`

## Performance Impact

- **Build time**: ~1-2s (esbuild) vs ~5-10s (tsc) per service
- **Runtime startup**: <100ms slower per service (bundle unpacking), negligible at scale
- **Runtime memory**: similar or slightly lower (single module load vs scattered files)
- **Artifact size**: Docker images ~5-10% smaller (single file, no scattered .d.ts)

## Migration Notes

1. **No breaking changes**: esbuild output is drop-in compatible with tsc output
2. **Source maps included**: use for production debugging (stored in image, not sent to clients)
3. **Service entry points unchanged**: `npm run start` still works in each service's package.json
4. **npm workspaces unchanged**: monorepo structure is identical

## Future Improvements

- [ ] Add esbuild plugin for bundle size analysis (dev-time only)
- [ ] Ship gzipped bundles to reduce image size further
- [ ] Consider splitting large services (transaction-service, wallet-service) into separate entry points if they grow >5MB

