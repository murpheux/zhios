# syntax=docker/dockerfile:1
# Build context: zhios repo root, e.g.:
#   docker build -f ozzo/infrastructure/docker/ozzo.Dockerfile -t ozzo/auth-service:<version> .
#
# ozzo is an auth/subscriptions service with Prisma ORM and PostgreSQL.
#
# Stages: builder (npm ci + tsc + prisma generate) -> prod-deps (npm ci --omit=dev + prisma generate)
#         -> runtime (prod node_modules + compiled dist + prisma schema, node-owned)

ARG NODE_IMAGE=node:22.22.0-alpine3.22

FROM ${NODE_IMAGE} AS builder
RUN apk add --no-cache openssl
WORKDIR /app
COPY ozzo/package.json ozzo/package-lock.json ./
COPY ozzo/prisma ./prisma
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
RUN npx prisma generate
COPY ozzo/tsconfig.json ozzo/tsconfig.build.json ./
COPY ozzo/src ./src
RUN npm run build

FROM ${NODE_IMAGE} AS prod-deps
RUN apk add --no-cache openssl
WORKDIR /app
COPY ozzo/package.json ozzo/package-lock.json ./
COPY ozzo/prisma ./prisma
# --ignore-scripts: no runtime dependency needs an install script; blocks lifecycle-script supply-chain abuse
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --ignore-scripts --no-audit --no-fund && \
    npx prisma generate && \
    npm cache clean --force

FROM ${NODE_IMAGE} AS runtime
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
# Files stay root-owned (read-only to the node user); compatible with readOnlyRootFilesystem
COPY --from=prod-deps /app ./
COPY --from=builder /app/dist ./dist

USER node
EXPOSE 3004

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "require('http').get('http://127.0.0.1:3004/healthz',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"]

CMD ["node", "dist/index.js"]
