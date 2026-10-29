# syntax=docker/dockerfile:1
# Build context MUST be the gnee/ repo root, e.g.:
#   docker build -f infrastructure/docker/web-spa.Dockerfile \
#     --build-arg VITE_ZUMA_GATEWAY_URL=https://zuma-gateway.example.com/graphql \
#     --build-arg VITE_OIDC_AUTHORITY=https://your-idp.example.com \
#     --build-arg VITE_OIDC_CLIENT_ID=gnee-web-spa \
#     --build-arg VITE_OIDC_REDIRECT_URI=https://wallet.example.com/callback \
#     -t gnee/web-spa .
# This is an npm workspaces monorepo: web-spa imports @gnee/api-client by workspace
# symlink, so `npm ci` needs the whole repo tree (hence `COPY . .` at root).
#
# None of the VITE_* build args below are secret: this is a public OIDC SPA client
# (Authorization Code + PKCE, no client secret), and the gateway URL/authority are
# public endpoints — they're baked into the static bundle like any other SPA config,
# not injected as runtime secrets. See infrastructure/README.md.

FROM node:22-alpine AS builder
WORKDIR /app
COPY . .
RUN npm ci

ARG VITE_ZUMA_GATEWAY_URL
ARG VITE_OIDC_AUTHORITY
ARG VITE_OIDC_CLIENT_ID
ARG VITE_OIDC_REDIRECT_URI
ARG VITE_OIDC_POST_LOGOUT_REDIRECT_URI
ARG VITE_OIDC_SCOPE
ARG VITE_OIDC_AUDIENCE
ENV VITE_ZUMA_GATEWAY_URL=$VITE_ZUMA_GATEWAY_URL \
    VITE_OIDC_AUTHORITY=$VITE_OIDC_AUTHORITY \
    VITE_OIDC_CLIENT_ID=$VITE_OIDC_CLIENT_ID \
    VITE_OIDC_REDIRECT_URI=$VITE_OIDC_REDIRECT_URI \
    VITE_OIDC_POST_LOGOUT_REDIRECT_URI=$VITE_OIDC_POST_LOGOUT_REDIRECT_URI \
    VITE_OIDC_SCOPE=$VITE_OIDC_SCOPE \
    VITE_OIDC_AUDIENCE=$VITE_OIDC_AUDIENCE

RUN npm run build -w @gnee/web-spa

# Runs as the non-root `nginx` user on port 8080 out of the box.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
COPY infrastructure/docker/web-spa.nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/spa/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O- http://127.0.0.1:8080/ > /dev/null || exit 1
