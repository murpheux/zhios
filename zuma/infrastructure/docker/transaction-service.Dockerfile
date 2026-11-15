# syntax=docker/dockerfile:1
# Build context MUST be the zuma/ repo root, e.g.:
#   docker build -f infrastructure/docker/transaction-service.Dockerfile -t zuma/transaction-service:<version> .
# npm workspaces monorepo: transaction-service imports @zuma/shared-* (common, config, logging,
# observability, http) by workspace symlink. esbuild bundles all source code into a single JS file;
# external deps (pino, mongoose, fastify, @opentelemetry/*, @aws-sdk/*) come from node_modules.
#
# Stages: builder (full install + esbuild) -> prod-deps (npm ci --omit=dev from the lockfile,
# manifests only) -> runtime (prod node_modules + bundled dist/transaction-service.js, root-owned, runs as node).

# TODO: pin by digest (docker buildx imagetools inspect node:22.22.0-alpine3.22)
ARG NODE_IMAGE=node:22.22.0-alpine3.22

FROM ${NODE_IMAGE} AS builder
WORKDIR /app
COPY . .
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
# esbuild bundles all source code and shared/* into a single JS file; uses tsconfig for type checking
RUN npm run build

FROM ${NODE_IMAGE} AS prod-deps
WORKDIR /app
# Every workspace manifest is required for npm ci to validate the lockfile
COPY package.json package-lock.json ./
COPY shared/common/package.json ./shared/common/
COPY shared/config/package.json ./shared/config/
COPY shared/logging/package.json ./shared/logging/
COPY shared/observability/package.json ./shared/observability/
COPY shared/http/package.json ./shared/http/
COPY services/wallet-service/package.json ./services/wallet-service/
COPY services/transaction-service/package.json ./services/transaction-service/
COPY graphql/package.json ./graphql/
# --ignore-scripts: no runtime dependency needs an install script; blocks lifecycle-script supply-chain abuse
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --ignore-scripts --no-audit --no-fund --workspace @zuma/transaction-service

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Files stay root-owned (read-only to the node user); compatible with readOnlyRootFilesystem
COPY --from=prod-deps /app ./
COPY --from=builder /app/dist/transaction-service.js ./dist/transaction-service.js
COPY --from=builder /app/dist/transaction-service.js.map ./dist/transaction-service.js.map

USER node
EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "require('http').get('http://127.0.0.1:3002/healthz',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"]

CMD ["node", "dist/transaction-service.js"]
