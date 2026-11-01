# syntax=docker/dockerfile:1
# Build context MUST be the gnee/ repo root, e.g.:
#   docker build -f infrastructure/docker/web-spa.Dockerfile \
#     --build-arg VITE_ZUMA_GATEWAY_URL=https://api.wallet.example.com/graphql \
#     --build-arg VITE_OIDC_AUTHORITY=https://your-idp.example.com \
#     --build-arg VITE_OIDC_CLIENT_ID=gnee-web-spa \
#     --build-arg VITE_OIDC_REDIRECT_URI=https://wallet.example.com/callback \
#     --build-arg VITE_OIDC_SCOPE="openid profile email" \
#     --build-arg VITE_OIDC_AUDIENCE=zuma-api \
#     -t gnee/web-spa:<version> .
# npm workspaces monorepo: web-spa imports @gnee/api-client by workspace symlink. Only the
# web-spa workspace (and what it links) is installed — not the Expo/React Native apps.
#
# None of the VITE_* build args are secret: this is a public OIDC SPA client (Authorization
# Code + PKCE, no client secret), and the gateway URL/authority are public endpoints — they're
# baked into the static bundle like any other SPA config. See infrastructure/README.md.
#
# Runtime env (CSP connect-src, rendered by envsubst at container start — origins, no paths):
#   ZUMA_GATEWAY_ORIGIN, OIDC_AUTHORITY_ORIGIN

# TODO: pin by digest (docker buildx imagetools inspect node:22.22.0-alpine3.22)
ARG NODE_IMAGE=node:22.22.0-alpine3.22
# TODO: pin by digest (docker buildx imagetools inspect nginxinc/nginx-unprivileged:1.27.5-alpine3.21)
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:1.27.5-alpine3.21

FROM ${NODE_IMAGE} AS builder
WORKDIR /app
COPY . .
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund --include-workspace-root --workspace @gnee/web-spa

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

# nginx-unprivileged: runs as uid 101 (non-root) and listens on 8080, no CAP_NET_BIND_SERVICE.
FROM ${NGINX_IMAGE} AS runtime
# Defined-but-empty defaults so envsubst always renders them (undefined vars are left literal)
ENV ZUMA_GATEWAY_ORIGIN="" \
    OIDC_AUTHORITY_ORIGIN=""
# The image entrypoint renders /etc/nginx/templates/*.template into /etc/nginx/conf.d/
COPY infrastructure/docker/web-spa.nginx.conf /etc/nginx/templates/default.conf.template
COPY infrastructure/docker/web-spa.security-headers.inc /etc/nginx/templates/security-headers.inc.template
COPY --from=builder /app/apps/web/spa/dist /usr/share/nginx/html

USER 101
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/healthz"]
