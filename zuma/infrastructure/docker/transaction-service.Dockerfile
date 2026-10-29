# syntax=docker/dockerfile:1
# Build context MUST be the zuma/ repo root, e.g.:
#   docker build -f infrastructure/docker/transaction-service.Dockerfile -t zuma/transaction-service .
# This is an npm workspaces monorepo: transaction-service imports @zuma/shared-* packages by
# workspace symlink, so `npm ci` needs the whole repo tree (hence `COPY . .` at root).

FROM node:22-alpine AS builder
WORKDIR /app
COPY . .
RUN npm ci
RUN npm run build -w @zuma/transaction-service
# Drops devDependencies but keeps the workspace symlinks npm ci created
RUN npm prune --omit=dev

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Copy only what's needed to run: pruned node_modules + each required workspace's package.json/dist
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/shared/common/package.json ./shared/common/package.json
COPY --from=builder --chown=node:node /app/shared/common/dist ./shared/common/dist
COPY --from=builder --chown=node:node /app/shared/config/package.json ./shared/config/package.json
COPY --from=builder --chown=node:node /app/shared/config/dist ./shared/config/dist
COPY --from=builder --chown=node:node /app/shared/logging/package.json ./shared/logging/package.json
COPY --from=builder --chown=node:node /app/shared/logging/dist ./shared/logging/dist
COPY --from=builder --chown=node:node /app/shared/observability/package.json ./shared/observability/package.json
COPY --from=builder --chown=node:node /app/shared/observability/dist ./shared/observability/dist
COPY --from=builder --chown=node:node /app/services/transaction-service/package.json ./services/transaction-service/package.json
COPY --from=builder --chown=node:node /app/services/transaction-service/dist ./services/transaction-service/dist

USER node
EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3002/healthz',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "services/transaction-service/dist/index.js"]
