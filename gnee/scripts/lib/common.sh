#!/usr/bin/env bash
# Shared helpers for gnee deploy scripts — source, don't execute:
#   source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"
# Every function returns non-zero on failure; callers run under `set -euo pipefail` and assign
# command substitutions on their own line (never `export X="$(...)"`, which masks the exit code).

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

# Reads one 1Password reference. Fails hard if `op` errors or the field is empty.
# The value goes to stdout only — never echo it or pass it to `set -x` output.
op_read_required() {
  local ref="$1" value
  command -v op >/dev/null 2>&1 || {
    printf 'error: 1Password CLI (op) not found; needed for %s\n' "$ref" >&2
    return 1
  }
  if ! value="$(op read --no-newline "$ref")"; then
    printf 'error: op read failed for %s (signed in? item/field exists?)\n' "$ref" >&2
    return 1
  fi
  if [[ -z "$value" ]]; then
    printf 'error: %s resolved to an empty value\n' "$ref" >&2
    return 1
  fi
  printf '%s' "$value"
}

# config_value VAR_NAME OP_REF — prints $VAR_NAME if set and non-empty, otherwise reads OP_REF.
config_value() {
  local name="$1" ref="$2"
  if [[ -n "${!name:-}" ]]; then
    printf '%s' "${!name}"
  else
    op_read_required "$ref"
  fi
}

# Prints scheme://host[:port] of a URL, or fails if it isn't an http(s) URL.
url_origin() {
  local url="$1"
  if [[ "$url" =~ ^(https?://[^/?#]+) ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
  else
    printf 'error: not an http(s) URL: %s\n' "$url" >&2
    return 1
  fi
}

# Resolves every VITE_* value the web-spa bundle needs into the caller's shell (env var wins,
# then 1Password). Gateway URL resolution is left to the caller (local vs remote rules differ).
resolve_oidc_config() {
  local value
  value="$(config_value VITE_OIDC_AUTHORITY "op://zuma/web-spa-oidc/authority")"
  VITE_OIDC_AUTHORITY="$value"
  value="$(config_value VITE_OIDC_CLIENT_ID "op://zuma/web-spa-oidc/client_id")"
  VITE_OIDC_CLIENT_ID="$value"
  # zuma requires JWT_AUDIENCE whenever it verifies OIDC tokens, so the audience is read from
  # 1Password unless explicitly set — set VITE_OIDC_AUDIENCE="" to opt out deliberately.
  if [[ -z "${VITE_OIDC_AUDIENCE+set}" ]]; then
    value="$(op_read_required "op://zuma/web-spa-oidc/audience")"
    VITE_OIDC_AUDIENCE="$value"
  fi
  VITE_OIDC_SCOPE="${VITE_OIDC_SCOPE:-openid profile email}"
  VITE_OIDC_POST_LOGOUT_REDIRECT_URI="${VITE_OIDC_POST_LOGOUT_REDIRECT_URI:-}"
}

# build_web_spa_image IMAGE_REF — expects VITE_ZUMA_GATEWAY_URL, VITE_OIDC_REDIRECT_URI and
# resolve_oidc_config to have run. Run from the gnee/ root (the build context).
build_web_spa_image() {
  local image="$1"
  docker build \
    -f infrastructure/docker/web-spa.Dockerfile \
    --build-arg VITE_ZUMA_GATEWAY_URL="$VITE_ZUMA_GATEWAY_URL" \
    --build-arg VITE_OIDC_AUTHORITY="$VITE_OIDC_AUTHORITY" \
    --build-arg VITE_OIDC_CLIENT_ID="$VITE_OIDC_CLIENT_ID" \
    --build-arg VITE_OIDC_REDIRECT_URI="$VITE_OIDC_REDIRECT_URI" \
    --build-arg VITE_OIDC_POST_LOGOUT_REDIRECT_URI="$VITE_OIDC_POST_LOGOUT_REDIRECT_URI" \
    --build-arg VITE_OIDC_SCOPE="$VITE_OIDC_SCOPE" \
    --build-arg VITE_OIDC_AUDIENCE="$VITE_OIDC_AUDIENCE" \
    -t "$image" \
    .
}

# Remote deploys must use an explicit HTTPS, non-loopback URL (browsers block mixed content and
# OIDC PKCE needs a secure context).
require_remote_https_url() {
  local name="$1" url="$2"
  [[ "$url" =~ ^https://[^/]+ ]] || die "${name} must be an https:// URL for remote deploys (got: ${url})"
  case "$url" in
    https://localhost* | https://127.* | https://\[::1\]*)
      die "${name} points at loopback (${url}); set the real public URL for remote deploys"
      ;;
  esac
}
