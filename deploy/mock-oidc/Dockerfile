# zhios dev OIDC provider (deploy/mock-oidc/server.mjs) — LOCAL DEVELOPMENT ONLY.
# Node stdlib only, same base image as the zuma services. Config is baked in (no bind mounts), so it
# also works against remote Docker daemons. Build context: deploy/mock-oidc/.
# TODO: pin by digest (docker buildx imagetools inspect node:22.22.0-alpine3.22)
FROM node:22.22.0-alpine3.22

WORKDIR /app
COPY --chown=root:root --chmod=0444 server.mjs config.json ./

ENV NODE_ENV=production \
    PORT=8080 \
    CONFIG_PATH=/app/config.json
USER node
EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/healthz"]

CMD ["node", "server.mjs"]
