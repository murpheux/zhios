#!/usr/bin/env bash
# Deploys apps/ios or apps/android via EAS Build/Submit (Expo's cloud build service) — the real
# equivalent of "deploy" for native mobile apps.
#
# Docker, Docker Swarm and Kubernetes do NOT apply here: iOS/Android ship as signed binaries
# through App Store Connect / Google Play, not containers. See deploy-docker.sh / deploy-swarm.sh /
# deploy-k8s.sh for the one app that actually runs in a container: apps/web/spa.
#
# Usage: scripts/deploy-mobile.sh <ios|android> <profile>
#   scripts/deploy-mobile.sh ios production
#   scripts/deploy-mobile.sh android production
#
# Credentials come from 1Password and fail hard if unreadable/empty. Key material is written only
# to 0600 temp files (umask 077), created AFTER `eas build` so it can never be included in the
# uploaded project archive, and deleted on exit. Nothing secret is echoed.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
# shellcheck source=lib/common.sh
source scripts/lib/common.sh

PLATFORM="${1:?usage: deploy-mobile.sh <ios|android> <profile>}"
PROFILE="${2:?usage: deploy-mobile.sh <ios|android> <profile>}"

case "$PLATFORM" in
  ios | android) ;;
  *) die "platform must be 'ios' or 'android', got: ${PLATFORM}" ;;
esac

APP_DIR="apps/${PLATFORM}"
# Path eas.json's submit.<profile>.android.serviceAccountKeyPath points at
PLAY_KEY_LINK="${APP_DIR}/google-service-account.json"

# EAS needs EXPO_TOKEN for non-interactive auth — never hardcode it.
if [[ -z "${EXPO_TOKEN:-}" ]]; then
  EXPO_TOKEN="$(op_read_required "op://zuma/eas/expo_token")"
fi
export EXPO_TOKEN

CLEANUP_PATHS=()
cleanup() {
  local p
  for p in "${CLEANUP_PATHS[@]+"${CLEANUP_PATHS[@]}"}"; do
    rm -f -- "$p"
  done
}
trap cleanup EXIT
trap 'exit 130' INT TERM

# write_secret_file OP_REF — writes the field to a fresh 0600 temp file, prints its path.
# Runs inside $(...), where errexit is not inherited — hence the explicit `|| return 1`s.
write_secret_file() {
  local ref="$1" path value
  value="$(op_read_required "$ref")" || return 1
  path="$(umask 077 && mktemp "${TMPDIR:-/tmp}/gnee-deploy.XXXXXX")" || return 1
  printf '%s' "$value" >"$path" || return 1
  printf '%s' "$path"
}

# Pin eas-cli for reproducible, reviewable builds (npx would otherwise fetch whatever is latest)
EAS_CLI="eas-cli@${EAS_CLI_VERSION:-latest}"

(
  cd "$APP_DIR"
  npx --yes "$EAS_CLI" build --platform "$PLATFORM" --profile "$PROFILE" --non-interactive
)

if [[ "$PLATFORM" == "ios" ]]; then
  # App Store Connect API key — eas-cli reads these env vars for non-interactive submit
  # (verify against `eas submit --help` after an eas-cli upgrade).
  ASC_KEY_PATH="$(write_secret_file "op://zuma/eas-ios/asc_api_key_p8")"
  CLEANUP_PATHS+=("$ASC_KEY_PATH")
  ASC_KEY_ID="$(op_read_required "op://zuma/eas-ios/asc_api_key_id")"
  ASC_ISSUER_ID="$(op_read_required "op://zuma/eas-ios/asc_api_key_issuer_id")"
  export EXPO_ASC_API_KEY_PATH="$ASC_KEY_PATH"
  export EXPO_ASC_API_KEY_ID="$ASC_KEY_ID"
  export EXPO_ASC_API_KEY_ISSUER_ID="$ASC_ISSUER_ID"
else
  # eas.json expects the key at a fixed relative path: keep the content in a 0600 temp file and
  # expose it there via a symlink only for the duration of `eas submit`.
  if [[ -e "$PLAY_KEY_LINK" || -L "$PLAY_KEY_LINK" ]]; then
    die "${PLAY_KEY_LINK} already exists — remove it (it must never be committed) and re-run"
  fi
  PLAY_KEY_PATH="$(write_secret_file "op://zuma/eas-android/service_account_json")"
  CLEANUP_PATHS+=("$PLAY_KEY_PATH" "$PLAY_KEY_LINK")
  ln -s "$PLAY_KEY_PATH" "$PLAY_KEY_LINK"
fi

(
  cd "$APP_DIR"
  npx --yes "$EAS_CLI" submit --platform "$PLATFORM" --profile "$PROFILE" --non-interactive --latest
)
