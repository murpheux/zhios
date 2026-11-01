#!/usr/bin/env bash
# Smoke test for the local stack. By default brings the root docker compose stack up
# (up -d --build --wait), then probes every service from the host and prints a PASS/FAIL table.
# The stack is left running unless --down is given.
#
# Usage: scripts/compose-smoke-test.sh [--down] [--no-up] [--no-build]
#   --down      docker compose down after the checks (volumes are kept)
#   --no-up     don't start anything; just probe (use this against the Terraform deploy too —
#               it publishes the same ports)
#   --no-build  docker compose up without --build
#
# Ports can be overridden with WEB_PORT, GATEWAY_PORT, WALLET_PORT, TRANSACTION_PORT, IDP_PORT.
# The issuer host must be "localhost" (tokens carry iss=http://localhost:<IDP_PORT>/zuma).
# The mock-IdP access token used for the authenticated check is kept in a variable and passed
# to curl via stdin (-H @-), never on the command line or in output.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

do_up=1
do_build=1
do_down=0
for arg in "$@"; do
  case "$arg" in
    --down) do_down=1 ;;
    --no-up) do_up=0 ;;
    --no-build) do_build=0 ;;
    -h | --help)
      sed -n '2,/^set -euo pipefail/{/^#/s/^# \{0,1\}//p;}' "${BASH_SOURCE[0]}"
      exit 0
      ;;
    *)
      echo "error: unknown argument: ${arg}" >&2
      exit 2
      ;;
  esac
done

web_port="${WEB_PORT:-8080}"
gateway_port="${GATEWAY_PORT:-3003}"
wallet_port="${WALLET_PORT:-3001}"
transaction_port="${TRANSACTION_PORT:-3002}"
idp_port="${IDP_PORT:-8090}"
web_origin="http://localhost:${web_port}"
issuer="http://localhost:${idp_port}/zuma"

for tool in curl docker; do
  command -v "$tool" >/dev/null 2>&1 || {
    echo "error: ${tool} not found" >&2
    exit 1
  }
done

hint_failure() {
  cat >&2 <<'EOF'

Hints:
  - every check 000 (connection refused) -> the stack runs on a remote Docker host; ports are
    published on ITS loopback. `make tunnel` (scripts/docker-tunnel.sh) forwards them here.
  - docker compose ps -a                 # which container is unhealthy / exited
  - docker compose logs --tail 100 <svc> # crash reason (zod config errors are explicit)
  - graphql-gateway exits at startup with a Fastify version error -> mercurius@14 refuses
    Fastify 5. Fix once, then rebuild (the Dockerfiles use `npm ci` from the lockfile):
        (cd zuma && npm install mercurius@^16 -w @zuma/graphql-gateway)
  - transaction-service config error about BITCOIN_ADAPTER -> it needs NODE_ENV=development
    with BITCOIN_ADAPTER=mock locally (set in deploy/compose/zuma.override.yml).
  - Mongo auth failures after regenerating .env -> the mongo volume keeps the OLD root
    password; `docker compose down -v` wipes it (deletes local data).
  - 401 on the authenticated check -> issuer/audience mismatch: JWT_ISSUER must be
    http://localhost:8090/zuma (browser-visible) and JWT_AUDIENCE zuma-api.
EOF
}

if [[ "$do_up" -eq 1 ]]; then
  [[ -f .env || -n "${ZHIOS_ENV_FILE:-}" ]] || {
    echo "error: root .env not found — run 'make secrets-local' (or 'make secrets-op') first" >&2
    exit 1
  }
  up_args=(up -d --wait --wait-timeout 300)
  if [[ "$do_build" -eq 1 ]]; then
    up_args+=(--build)
  fi
  echo "==> docker compose ${up_args[*]}"
  if ! docker compose "${up_args[@]}"; then
    echo "FAIL: docker compose up did not reach a healthy state" >&2
    docker compose ps -a >&2 || true
    hint_failure
    exit 1
  fi
fi

# Remote daemon (ssh:// context, e.g. scarlet-daemon): its 127.0.0.1-bound ports are only reachable here
# through the SSH tunnel. Idempotent; a no-op for a local daemon.
if ! bash "$repo_root/scripts/docker-tunnel.sh" start; then
  echo "FAIL: the Docker daemon is remote and its ports could not be forwarded to localhost" >&2
  exit 1
fi

results=()
failures=0

record() {
  local status="$1" name="$2" detail="$3"
  results+=("${status}|${name}|${detail}")
  if [[ "$status" == "FAIL" ]]; then
    failures=$((failures + 1))
  fi
}

# check_status NAME EXPECTED_CODE URL [curl args...]
check_status() {
  local name="$1" expected="$2" url="$3"
  shift 3
  local code
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$@" "$url" 2>/dev/null || true)"
  if [[ "$code" == "$expected" ]]; then
    record PASS "$name" "HTTP ${code}"
  else
    record FAIL "$name" "expected ${expected}, got ${code:-no response}"
  fi
}

# 1. Liveness/readiness on every zuma service
for svc in "wallet-service:${wallet_port}" "transaction-service:${transaction_port}" "graphql-gateway:${gateway_port}"; do
  name="${svc%%:*}"
  port="${svc##*:}"
  check_status "${name} /healthz" 200 "http://localhost:${port}/healthz"
  check_status "${name} /readyz" 200 "http://localhost:${port}/readyz"
done

# 2. GraphQL through the gateway (no auth needed for __typename)
gql_body="$(curl -sS --max-time 10 -H 'content-type: application/json' \
  --data '{"query":"{ __typename }"}' "http://localhost:${gateway_port}/graphql" 2>/dev/null || true)"
if [[ "$gql_body" == *'"__typename":"Query"'* ]]; then
  record PASS "gateway GraphQL { __typename }" "data.__typename=Query"
else
  record FAIL "gateway GraphQL { __typename }" "unexpected body: ${gql_body:0:120}"
fi

# 3. CORS preflight from the SPA origin
cors_headers="$(curl -sS -o /dev/null -D - --max-time 10 -X OPTIONS \
  -H "Origin: ${web_origin}" -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: authorization,content-type' \
  "http://localhost:${gateway_port}/graphql" 2>/dev/null || true)"
if grep -qi "^access-control-allow-origin: ${web_origin}" <<<"$cors_headers"; then
  record PASS "gateway CORS preflight" "allows ${web_origin}"
else
  record FAIL "gateway CORS preflight" "no Access-Control-Allow-Origin for ${web_origin}"
fi

# 4. Web SPA: health, index and security headers
check_status "web-spa /healthz" 200 "${web_origin}/healthz"
web_headers="$(curl -sS -o /dev/null -D - --max-time 10 "${web_origin}/" 2>/dev/null || true)"
if [[ "$web_headers" =~ ^HTTP/[0-9.]+\ 200 ]]; then
  record PASS "web-spa index" "HTTP 200"
else
  record FAIL "web-spa index" "no 200 for ${web_origin}/"
fi
for header in content-security-policy x-content-type-options x-frame-options referrer-policy permissions-policy; do
  if grep -qi "^${header}:" <<<"$web_headers"; then
    record PASS "web-spa header ${header}" "present"
  else
    record FAIL "web-spa header ${header}" "missing"
  fi
done
if grep -i '^content-security-policy:' <<<"$web_headers" | grep -q "localhost:${idp_port}"; then
  record PASS "web-spa CSP allows IdP" "connect-src includes localhost:${idp_port}"
else
  record FAIL "web-spa CSP allows IdP" "OIDC_AUTHORITY_ORIGIN not rendered into CSP"
fi

# 5. Mock OIDC discovery document: issuer must be the browser-visible URL
discovery="$(curl -sS --max-time 10 "${issuer}/.well-known/openid-configuration" 2>/dev/null || true)"
discovered_issuer=""
if command -v jq >/dev/null 2>&1; then
  discovered_issuer="$(jq -r '.issuer // empty' <<<"$discovery" 2>/dev/null || true)"
elif [[ "$discovery" =~ \"issuer\"[[:space:]]*:[[:space:]]*\"([^\"]+)\" ]]; then
  discovered_issuer="${BASH_REMATCH[1]}"
fi
if [[ "$discovered_issuer" == "$issuer" ]]; then
  record PASS "mock-oidc discovery" "issuer=${issuer}"
else
  record FAIL "mock-oidc discovery" "expected issuer ${issuer}, got ${discovered_issuer:-none}"
fi

# 6. End-to-end JWT: client_credentials token from the mock IdP -> wallet-service verifies it
#    via JWKS (iss/aud/alg). Scope "zuma-user" maps to sub=postman-user, roles=[user].
token_json="$(curl -sS --max-time 10 \
  --data-urlencode grant_type=client_credentials \
  --data-urlencode client_id=smoke-test \
  --data-urlencode client_secret=not-a-secret \
  --data-urlencode scope=zuma-user \
  "${issuer}/token" 2>/dev/null || true)"
access_token=""
if [[ "$token_json" =~ \"access_token\"[[:space:]]*:[[:space:]]*\"([^\"]+)\" ]]; then
  access_token="${BASH_REMATCH[1]}"
fi
if [[ -n "$access_token" ]]; then
  record PASS "mock-oidc token (client_credentials)" "access_token issued"
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 -H @- \
    "http://localhost:${wallet_port}/api/v1/wallets" 2>/dev/null <<<"Authorization: Bearer ${access_token}" || true)"
  if [[ "$code" == "200" ]]; then
    record PASS "wallet-service accepts IdP JWT" "GET /api/v1/wallets -> 200"
  else
    record FAIL "wallet-service accepts IdP JWT" "GET /api/v1/wallets -> ${code:-no response}"
  fi
else
  record FAIL "mock-oidc token (client_credentials)" "no access_token in token response"
  record FAIL "wallet-service accepts IdP JWT" "skipped (no token)"
fi
unset access_token token_json
check_status "wallet-service rejects anonymous" 401 "http://localhost:${wallet_port}/api/v1/wallets"

# Report
printf '\n%-6s  %-40s  %s\n' "RESULT" "CHECK" "DETAIL"
printf '%-6s  %-40s  %s\n' "------" "----------------------------------------" "------"
for row in "${results[@]}"; do
  IFS='|' read -r status name detail <<<"$row"
  printf '%-6s  %-40s  %s\n' "$status" "$name" "$detail"
done
printf '\n%d checks, %d failed\n' "${#results[@]}" "$failures"

if [[ "$do_down" -eq 1 ]]; then
  echo "==> docker compose down"
  docker compose down
fi

if [[ "$failures" -gt 0 ]]; then
  hint_failure
  exit 1
fi
echo "Stack: web ${web_origin}  gateway http://localhost:${gateway_port}/graphql  IdP ${issuer}"
