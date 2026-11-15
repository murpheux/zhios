# syntax=docker/dockerfile:1
# Build context MUST be the zhios repo root, e.g.:
#   docker build -f yone/infrastructure/docker/yone.Dockerfile -t yone/notification-service:<version> .
#
# yone is a standalone service with no workspace dependencies. The monorepo context is needed
# only to share shared/* workspaces (if applicable in future); for now, build from yone/ root.
#
# Stages: builder (npm ci + esbuild) -> prod-deps (npm ci --omit=dev) -> runtime (prod node_modules + dist, node-owned)

ARG NODE_IMAGE=node:22.22.0-alpine3.22

FROM ${NODE_IMAGE} AS builder
WORKDIR /app
COPY yone/package.json yone/package-lock.json ./
COPY yone/esbuild.config.mjs ./
COPY yone/src ./src
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
RUN npm run build

FROM ${NODE_IMAGE} AS prod-deps
WORKDIR /app
COPY yone/package.json yone/package-lock.json ./
# --ignore-scripts: no runtime dependency needs an install script; blocks lifecycle-script supply-chain abuse
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --ignore-scripts --no-audit --no-fund

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Files stay root-owned (read-only to the node user); compatible with readOnlyRootFilesystem
COPY --from=prod-deps /app ./
COPY --from=builder /app/dist ./dist

USER node
EXPOSE 3005

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "require('http').get('http://127.0.0.1:3005/healthz',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"]

CMD ["node", "dist/index.js"]
