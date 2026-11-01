#!/usr/bin/env bash
# Runs the zuma Postman collection headless with newman in Docker against a running stack.
#
#   make postman                                              # root zhios stack (OIDC/JWKS), secrets from root .env
#   bash zuma/scripts/run-postman.sh --folder '0 Health'      # one folder (repeatable, runs in order)
#   bash zuma/scripts/run-postman.sh --compose-network zhios_edge        # attach to the compose network
#   bash zuma/scripts/run-postman.sh --auth-mode hs256        # zuma/docker-compose.yml alone (HS256, zuma/.env)
#   op run --env-file=<op env file> -- bash zuma/scripts/run-postman.sh --no-env-file   # secrets via 1Password
#
# Secrets (JWT_SECRET, INTERNAL_JWT_SECRET, METRICS_TOKEN) are taken from the shell environment if set,
# otherwise read from the same dotenv file the compose stack uses (root .env / $ZHIOS_ENV_FILE for the
# zhios stack, zuma/.env for the standalone zuma stack). They are written only to a private
# temp Postman environment file (0600, removed on exit) mounted read-only into the container — never
# passed on a command line, never printed. Reports: docs/postman/reports/ (git-ignored).
set -euo pipefail

# TODO: pin by digest (docker buildx imagetools inspect postman/newman:6.2.1-alpine)
readonly DEFAULT_NEWMAN_IMAGE="postman/newman:6.2.1-alpine"
NEWMAN_IMAGE="${NEWMAN_IMAGE:-$DEFAULT_NEWMAN_IMAGE}"
# Host-side runner version (npx), kept in step with the image tag above.
readonly NEWMAN_NPM_VERSION="${NEWMAN_NPM_VERSION:-6.2.1}"

ZUMA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly ZUMA_DIR
REPO_DIR="$(cd "$ZUMA_DIR/.." && pwd)"
readonly REPO_DIR
readonly POSTMAN_DIR="$ZUMA_DIR/docs/postman"
readonly COLLECTION_FILE="zuma.postman_collection.json"
readonly REPORTS_DIR="$POSTMAN_DIR/reports"

usage() {
  cat <<'EOF'
Usage: scripts/run-postman.sh [options]

  --env-file PATH          dotenv file to read secrets from
                           (default: $ZHIOS_ENV_FILE or <repo>/.env; zuma/.env with --auth-mode hs256)
  --no-env-file            read secrets only from the shell environment (e.g. under `op run`)
  --environment PATH       Postman environment JSON (default: docs/postman/zuma-local.postman_environment.json,
                           or zuma-standalone-hs256.postman_environment.json with --auth-mode hs256)
  --folder NAME            run only this folder; repeat to run several in order
  --base-url URL           scheme://host for all three services; ports 3001/3002/3003 are appended
  --wallet-url URL         override walletUrl
  --transaction-url URL    override transactionUrl
  --gateway-url URL        override gatewayUrl
  --network NAME           docker network for the newman container (default: host on Linux, bridge on macOS)
  --compose-network NAME   attach to a compose network (zhios stack: zhios_edge) and use service DNS names
                           (wallet-service:3001, transaction-service:3002, graphql-gateway:3003, mock-oidc:8080)
  --auth-mode MODE         oidc (zhios stack, default) or hs256 (standalone zuma stack)
  --oidc-token-url URL     token endpoint for oidc mode (default from the environment: localhost:8090/zuma/token)
  --oidc-host-header HOST  Host header for token requests so iss matches JWT_ISSUER (default localhost:<IDP_PORT>
                           whenever the IdP is reached under another name)
  --reporters LIST         newman reporters (default: cli,junit). Add htmlextra only with an image that has it.
  --bail                   stop at the first failing request
  --runner MODE            auto (default), docker or npx. auto = docker for a local daemon, npx when the
                           daemon is remote (ssh:// context): bind mounts can't reach a remote daemon,
                           and the stack is reached through the SSH tunnel on localhost (`make tunnel`)
  -h, --help               show this help

Environment: NEWMAN_IMAGE overrides the image (default postman/newman:6.2.1-alpine).
Secrets read: JWT_SECRET, INTERNAL_JWT_SECRET, METRICS_TOKEN; optional JWT_ISSUER, JWT_AUDIENCE,
INTERNAL_JWT_ISSUER, IDP_PORT (non-secret, default 8090).
EOF
}

die() {
  echo "error: $*" >&2
  exit 2
}

env_file=""
use_env_file=true
environment_file=""
folders=()
base_url=""
wallet_url=""
transaction_url=""
gateway_url=""
network=""
auth_mode=""
oidc_token_url=""
oidc_host_header=""
reporters="cli,junit"
runner="${NEWMAN_RUNNER:-auto}"
bail=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file) env_file="${2:?--env-file needs a path}"; shift 2 ;;
    --no-env-file) use_env_file=false; shift ;;
    --environment) environment_file="${2:?--environment needs a path}"; shift 2 ;;
    --folder) folders+=("${2:?--folder needs a name}"); shift 2 ;;
    --base-url) base_url="${2:?--base-url needs a URL}"; shift 2 ;;
    --wallet-url) wallet_url="${2:?--wallet-url needs a URL}"; shift 2 ;;
    --transaction-url) transaction_url="${2:?--transaction-url needs a URL}"; shift 2 ;;
    --gateway-url) gateway_url="${2:?--gateway-url needs a URL}"; shift 2 ;;
    --network) network="${2:?--network needs a name}"; shift 2 ;;
    --compose-network)
      network="${2:?--compose-network needs a name}"
      compose_network=true
      shift 2
      ;;
    --auth-mode) auth_mode="${2:?--auth-mode needs hs256|oidc}"; shift 2 ;;
    --oidc-token-url) oidc_token_url="${2:?--oidc-token-url needs a URL}"; shift 2 ;;
    --oidc-host-header) oidc_host_header="${2:?--oidc-host-header needs host:port}"; shift 2 ;;
    --reporters) reporters="${2:?--reporters needs a list}"; shift 2 ;;
    --runner) runner="${2:?--runner needs auto|docker|npx}"; shift 2 ;;
    --bail) bail=true; shift ;;
    -h | --help) usage; exit 0 ;;
    *) usage >&2; die "unknown option: $1" ;;
  esac
done

command -v docker >/dev/null 2>&1 || die "docker is required"
command -v jq >/dev/null 2>&1 || die "jq is required (brew install jq / apt-get install -y jq)"
case "${auth_mode:-oidc}" in hs256 | oidc) ;; *) die "--auth-mode must be hs256 or oidc" ;; esac

# Pick the environment matching the stack: the zhios stack verifies OIDC/JWKS tokens, the standalone
# zuma stack HS256 — a stack accepts exactly one of the two (shared/http/src/auth.ts).
if [[ -z "$environment_file" ]]; then
  if [[ "$auth_mode" == hs256 ]]; then
    environment_file="$POSTMAN_DIR/zuma-standalone-hs256.postman_environment.json"
  else
    environment_file="$POSTMAN_DIR/zuma-local.postman_environment.json"
  fi
fi
[[ -f "$environment_file" ]] || die "Postman environment not found: $environment_file"
[[ -f "$POSTMAN_DIR/$COLLECTION_FILE" ]] || die "collection not found: $POSTMAN_DIR/$COLLECTION_FILE"
effective_auth_mode="${auth_mode:-$(jq -r '(.values[] | select(.key == "authMode") | .value) // "oidc"' "$environment_file")}"

if [[ -z "$env_file" ]]; then
  if [[ "$effective_auth_mode" == hs256 ]]; then
    env_file="$ZUMA_DIR/.env"
  else
    env_file="${ZHIOS_ENV_FILE:-$REPO_DIR/.env}"
  fi
fi

# Reads KEY=value from a dotenv file without executing it (no `source`): last assignment wins,
# optional `export ` prefix, surrounding single/double quotes and a trailing CR are stripped.
read_dotenv_key() {
  local file="$1" key="$2" line value
  line="$(grep -E "^[[:space:]]*(export[[:space:]]+)?${key}=" "$file" | tail -n 1 || true)"
  [[ -n "$line" ]] || return 0
  value="${line#*=}"
  value="${value%$'\r'}"
  if [[ "$value" =~ ^\"(.*)\"$ ]] || [[ "$value" =~ ^\'(.*)\'$ ]]; then
    value="${BASH_REMATCH[1]}"
  fi
  printf '%s' "$value"
}

# Shell environment wins over the dotenv file.
secret_or_file() {
  local key="$1"
  if [[ -n "${!key:-}" ]]; then
    printf '%s' "${!key}"
  elif [[ "$use_env_file" == true && -f "$env_file" ]]; then
    read_dotenv_key "$env_file" "$key"
  fi
}

if [[ "$use_env_file" == true && ! -f "$env_file" ]]; then
  echo "warning: $env_file not found; using only the shell environment for secrets" >&2
fi

jwt_secret="$(secret_or_file JWT_SECRET)"
internal_jwt_secret="$(secret_or_file INTERNAL_JWT_SECRET)"
metrics_token="$(secret_or_file METRICS_TOKEN)"
jwt_issuer="$(secret_or_file JWT_ISSUER)"
jwt_audience="$(secret_or_file JWT_AUDIENCE)"
internal_jwt_issuer="$(secret_or_file INTERNAL_JWT_ISSUER)"
idp_port="$(secret_or_file IDP_PORT)"
idp_port="${idp_port:-8090}"

report_secret() {
  if [[ -n "$2" ]]; then echo "  $1: set"; else echo "  $1: MISSING"; fi
}
echo "Secrets (values are never printed):"
report_secret JWT_SECRET "$jwt_secret"
report_secret INTERNAL_JWT_SECRET "$internal_jwt_secret"
report_secret METRICS_TOKEN "$metrics_token"
if [[ "$effective_auth_mode" == hs256 && -z "$jwt_secret" ]]; then
  die "JWT_SECRET is required for --auth-mode hs256 (set it in $env_file or the shell environment)"
fi
[[ -n "$internal_jwt_secret" ]] || echo "warning: INTERNAL_JWT_SECRET missing — '4 Internal service routes' will fail" >&2
[[ -n "$metrics_token" ]] || echo "warning: METRICS_TOKEN missing — /metrics checks assume the stack has no token configured" >&2

# Default target: host networking on Linux (localhost works); Docker Desktop on macOS can't reach the
# host's loopback through --network host by default, so use host.docker.internal on the bridge network.
docker_endpoint="${DOCKER_HOST:-$(docker context inspect --format '{{.Endpoints.docker.Host}}' 2>/dev/null || true)}"
if [[ "$runner" == auto ]]; then
  case "$docker_endpoint" in
    "" | unix://* | npipe://*) runner=docker ;;
    *) runner=npx ;;
  esac
fi
case "$runner" in
  docker) ;;
  npx)
    command -v npx >/dev/null 2>&1 || die "--runner npx needs Node.js/npx on this machine"
    [[ -z "$network" && "${compose_network:-false}" != true ]] || die "--network/--compose-network only apply to --runner docker"
    ;;
  *) die "unknown --runner '$runner' (auto|docker|npx)" ;;
esac

compose_network="${compose_network:-false}"
if [[ "$runner" == docker && -z "$network" ]]; then
  if [[ "$(uname -s)" == Darwin ]]; then
    network="bridge"
    base_url="${base_url:-http://host.docker.internal}"
  else
    network="host"
  fi
fi
if [[ "$compose_network" == true ]]; then
  wallet_url="${wallet_url:-http://wallet-service:3001}"
  transaction_url="${transaction_url:-http://transaction-service:3002}"
  gateway_url="${gateway_url:-http://graphql-gateway:3003}"
  oidc_token_url="${oidc_token_url:-http://mock-oidc:8080/zuma/token}"
fi
if [[ -n "$base_url" ]]; then
  base_url="${base_url%/}"
  wallet_url="${wallet_url:-$base_url:3001}"
  transaction_url="${transaction_url:-$base_url:3002}"
  gateway_url="${gateway_url:-$base_url:3003}"
  oidc_token_url="${oidc_token_url:-$base_url:$idp_port/zuma/token}"
fi
# The zhios dev IdP pins iss via $ISSUER, so the Host header doesn't matter there. The override is kept
# for IdPs that derive iss from the Host they're reached on (harmless with ours).
if [[ -n "$oidc_token_url" && -z "$oidc_host_header" && ! "$oidc_token_url" =~ ^https?://localhost: ]]; then
  oidc_host_header="localhost:$idp_port"
fi

workdir="$(mktemp -d "${TMPDIR:-/tmp}/zuma-newman.XXXXXX")"
trap 'rm -rf "$workdir"' EXIT
chmod 700 "$workdir"
(
  umask 077
  # Secrets reach jq through its environment ($ENV), not argv.
  ZPM_JWT_SECRET="$jwt_secret" \
    ZPM_INTERNAL_JWT_SECRET="$internal_jwt_secret" \
    ZPM_METRICS_TOKEN="$metrics_token" \
    ZPM_JWT_ISSUER="$jwt_issuer" \
    ZPM_JWT_AUDIENCE="$jwt_audience" \
    ZPM_INTERNAL_JWT_ISSUER="$internal_jwt_issuer" \
    ZPM_WALLET_URL="$wallet_url" \
    ZPM_TRANSACTION_URL="$transaction_url" \
    ZPM_GATEWAY_URL="$gateway_url" \
    ZPM_AUTH_MODE="$auth_mode" \
    ZPM_OIDC_TOKEN_URL="$oidc_token_url" \
    ZPM_OIDC_HOST_HEADER="$oidc_host_header" \
    jq '
      def setv($k; $v; $t):
        if ($v // "") == "" then .
        elif any(.values[]; .key == $k) then .values |= map(if .key == $k then .value = $v | .type = $t else . end)
        else .values += [{ key: $k, value: $v, type: $t, enabled: true }]
        end;
      setv("jwtSecret"; $ENV.ZPM_JWT_SECRET; "secret")
      | setv("internalJwtSecret"; $ENV.ZPM_INTERNAL_JWT_SECRET; "secret")
      | setv("metricsToken"; $ENV.ZPM_METRICS_TOKEN; "secret")
      | setv("jwtIssuer"; $ENV.ZPM_JWT_ISSUER; "default")
      | setv("jwtAudience"; $ENV.ZPM_JWT_AUDIENCE; "default")
      | setv("internalJwtIssuer"; $ENV.ZPM_INTERNAL_JWT_ISSUER; "default")
      | setv("walletUrl"; $ENV.ZPM_WALLET_URL; "default")
      | setv("transactionUrl"; $ENV.ZPM_TRANSACTION_URL; "default")
      | setv("gatewayUrl"; $ENV.ZPM_GATEWAY_URL; "default")
      | setv("authMode"; $ENV.ZPM_AUTH_MODE; "default")
      | setv("oidcTokenUrl"; $ENV.ZPM_OIDC_TOKEN_URL; "default")
      | setv("oidcHostHeader"; $ENV.ZPM_OIDC_HOST_HEADER; "default")
    ' "$environment_file" >"$workdir/environment.json"
)
# Stays 0600/0700: the container runs as the caller's uid (--user below), so it can still read it.

mkdir -p "$REPORTS_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"

if [[ "$runner" == docker ]]; then
  collection_path="/etc/newman/collection/$COLLECTION_FILE"
  env_path="/etc/newman/env/environment.json"
  reports_path="/etc/newman/reports"
else
  collection_path="$POSTMAN_DIR/$COLLECTION_FILE"
  env_path="$workdir/environment.json"
  reports_path="$REPORTS_DIR"
fi

newman_args=(
  run "$collection_path"
  --environment "$env_path"
  --reporters "$reporters"
  --reporter-junit-export "$reports_path/newman-junit-$stamp.xml"
  --timeout-request 15000
  --color on
)
if [[ ",$reporters," == *",htmlextra,"* ]]; then
  newman_args+=(--reporter-htmlextra-export "$reports_path/newman-$stamp.html" --reporter-htmlextra-skipSensitiveData)
fi
[[ "$bail" == true ]] && newman_args+=(--bail)
for f in "${folders[@]+"${folders[@]}"}"; do
  newman_args+=(--folder "$f")
done

if [[ "$runner" == docker ]]; then runner_desc="docker image=$NEWMAN_IMAGE network=$network"; else runner_desc="npx newman@$NEWMAN_NPM_VERSION (docker endpoint ${docker_endpoint})"; fi
echo "newman: runner=$runner_desc auth=$effective_auth_mode environment=${environment_file##*/}"
[[ "$effective_auth_mode" == oidc ]] && echo "        oidc=${oidc_token_url:-<environment>} host-header=${oidc_host_header:-<none>}"
echo "        wallet=${wallet_url:-<environment>} transaction=${transaction_url:-<environment>} gateway=${gateway_url:-<environment>}"
[[ ${#folders[@]} -gt 0 ]] && echo "        folders: ${folders[*]}"

status=0
if [[ "$runner" == docker ]]; then
  docker run --rm \
    --network "$network" \
    --user "$(id -u):$(id -g)" \
    -v "$POSTMAN_DIR:/etc/newman/collection:ro" \
    -v "$workdir:/etc/newman/env:ro" \
    -v "$REPORTS_DIR:/etc/newman/reports" \
    "$NEWMAN_IMAGE" "${newman_args[@]}" || status=$?
else
  [[ ",$reporters," != *",htmlextra,"* ]] || die "htmlextra is not bundled with npx newman; use --reporters cli,junit"
  npx --yes "newman@$NEWMAN_NPM_VERSION" "${newman_args[@]}" || status=$?
fi

echo "reports: $REPORTS_DIR (junit: newman-junit-$stamp.xml)"
exit "$status"
