#!/usr/bin/env bash
# Builds gnee/web-spa, pushes it to a registry reachable by every swarm node, then deploys/updates
# the stack (web-spa behind a Caddy TLS proxy — see infrastructure/docker/web-spa-stack.yml).
# Per CLAUDE.md, prefer the scarlet-daemon docker context over raw SSH:
#   docker context use scarlet-daemon && ./scripts/deploy-swarm.sh
#
# Required: REGISTRY, SITE_ADDRESS (public hostname). Gateway URL and OIDC settings come from env
# vars or 1Password; a failed or empty `op read` aborts. No localhost defaults for remote deploys.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
# shellcheck source=lib/common.sh
source scripts/lib/common.sh

REGISTRY="${REGISTRY:?set REGISTRY, e.g. scarlet:5000 — swarm workers pull from it, not the manager local build cache}"
SITE_ADDRESS="${SITE_ADDRESS:?set SITE_ADDRESS to the public hostname served over HTTPS, e.g. wallet.example.com}"
STACK_NAME="${STACK_NAME:-gnee}"
if [[ -z "${IMAGE_TAG:-}" ]]; then
  IMAGE_TAG="$(git rev-parse --short HEAD)"
fi

VITE_ZUMA_GATEWAY_URL="$(config_value VITE_ZUMA_GATEWAY_URL "op://zuma/web-spa-oidc/gateway_url")"
require_remote_https_url VITE_ZUMA_GATEWAY_URL "$VITE_ZUMA_GATEWAY_URL"
VITE_OIDC_REDIRECT_URI="${VITE_OIDC_REDIRECT_URI:-https://${SITE_ADDRESS}/callback}"
require_remote_https_url VITE_OIDC_REDIRECT_URI "$VITE_OIDC_REDIRECT_URI"
resolve_oidc_config
require_remote_https_url VITE_OIDC_AUTHORITY "$VITE_OIDC_AUTHORITY"

ZUMA_GATEWAY_ORIGIN="$(url_origin "$VITE_ZUMA_GATEWAY_URL")"
OIDC_AUTHORITY_ORIGIN="$(url_origin "$VITE_OIDC_AUTHORITY")"
IMAGE="${REGISTRY}/gnee/web-spa:${IMAGE_TAG}"

build_web_spa_image "$IMAGE"
docker push "$IMAGE"

REGISTRY="$REGISTRY" IMAGE_TAG="$IMAGE_TAG" SITE_ADDRESS="$SITE_ADDRESS" \
  ZUMA_GATEWAY_ORIGIN="$ZUMA_GATEWAY_ORIGIN" OIDC_AUTHORITY_ORIGIN="$OIDC_AUTHORITY_ORIGIN" \
  docker stack deploy --with-registry-auth -c infrastructure/docker/web-spa-stack.yml "$STACK_NAME"

echo "Deployed ${IMAGE} to swarm stack '${STACK_NAME}' at https://${SITE_ADDRESS}"
echo "Check rollout: docker stack services ${STACK_NAME}"
