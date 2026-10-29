#!/usr/bin/env bash
# Deploys apps/ios or apps/android via EAS Build/Submit (Expo's cloud build
# service) — the real equivalent of "deploy" for native mobile apps.
#
# Docker, Docker Swarm and Kubernetes do NOT apply here: iOS/Android ship as
# signed binaries through App Store Connect / Google Play, not containers.
# See scripts/deploy-docker.sh / deploy-swarm.sh / deploy-k8s.sh for the one
# app that actually runs in a container: apps/web/spa.
#
# Usage: scripts/deploy-mobile.sh <ios|android> <profile>
#   scripts/deploy-mobile.sh ios production
#   scripts/deploy-mobile.sh android production
set -euo pipefail

cd "$(dirname "$0")/.."

PLATFORM="${1:?usage: deploy-mobile.sh <ios|android> <profile>}"
PROFILE="${2:?usage: deploy-mobile.sh <ios|android> <profile>}"

case "$PLATFORM" in
  ios|android) ;;
  *) echo "platform must be 'ios' or 'android', got: $PLATFORM" >&2; exit 1 ;;
esac

APP_DIR="apps/$PLATFORM"

# EAS needs EXPO_TOKEN for non-interactive CI auth — never hardcode it.
if [ -z "${EXPO_TOKEN:-}" ]; then
  EXPO_TOKEN="$(op read "op://zuma/eas/expo_token" 2>/dev/null || true)"
  export EXPO_TOKEN
fi

CLEANUP_FILES=()
cleanup() {
  for f in "${CLEANUP_FILES[@]:-}"; do
    [ -n "$f" ] && rm -f "$f"
  done
}
trap cleanup EXIT

if [ "$PLATFORM" = "ios" ]; then
  # App Store Connect API key — eas-cli reads these env vars automatically
  # for non-interactive submit (verify against current `eas submit --help`
  # if this stops working after an eas-cli upgrade).
  ASC_KEY_PATH="$(mktemp)"
  CLEANUP_FILES+=("$ASC_KEY_PATH")
  op read "op://zuma/eas-ios/asc_api_key_p8" > "$ASC_KEY_PATH"
  export EXPO_ASC_API_KEY_PATH="$ASC_KEY_PATH"
  export EXPO_ASC_API_KEY_ID="$(op read "op://zuma/eas-ios/asc_api_key_id")"
  export EXPO_ASC_API_KEY_ISSUER_ID="$(op read "op://zuma/eas-ios/asc_api_key_issuer_id")"
else
  SERVICE_ACCOUNT_PATH="$APP_DIR/google-service-account.json"
  CLEANUP_FILES+=("$SERVICE_ACCOUNT_PATH")
  op read "op://zuma/eas-android/service_account_json" > "$SERVICE_ACCOUNT_PATH"
fi

(
  cd "$APP_DIR"
  npx eas-cli build --platform "$PLATFORM" --profile "$PROFILE" --non-interactive
  npx eas-cli submit --platform "$PLATFORM" --profile "$PROFILE" --non-interactive --latest
)
