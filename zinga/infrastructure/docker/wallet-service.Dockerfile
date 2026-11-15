# Multi-stage build for zinga wallet-service using esbuild bundling
#
# STAGE 1: Build and bundle with esbuild
# - Bundles all application code + shared workspaces into a single dist/index.cjs file
# - External: pg, pino, @opentelemetry/*, @aws-sdk/*, Node.js builtins (loaded at runtime)
#
# STAGE 2: Production runtime
# - Minimal image with only dependencies needed at runtime
# - No tsc, TypeScript, or dev tools
# - Single bundled file + node_modules with external packages only

FROM node:22-alpine AS builder

WORKDIR /app

# Copy workspace structure and package files
COPY package*.json ./
COPY tsconfig.json ./
COPY esbuild.config.js ./

# Copy source code
COPY services/wallet-service ./services/wallet-service
COPY shared ./shared

# Install all dependencies (including devDependencies for esbuild)
RUN npm ci

# Run esbuild in production mode (minifies, uses inline sourcemaps)
RUN NODE_ENV=production npm run build

# Verify bundle was created successfully
RUN ls -lh dist/index.cjs && echo "✓ Bundle created successfully"

# ============================================================================

FROM node:22-alpine

WORKDIR /app

# Copy package files for runtime dependencies
COPY package*.json ./

# Install only production dependencies
# This ensures we have pg, pino, @opentelemetry/*, @aws-sdk/*, etc.
# but excludes dev tools (esbuild, TypeScript, biome, etc.)
RUN npm ci --only=production

# Copy bundled application from builder stage
COPY --from=builder /app/dist/index.cjs ./dist/index.cjs

# Health check: wallet-service listens on $PORT (default 3000)
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/readyz', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Start the bundled application
CMD ["node", "dist/index.cjs"]
