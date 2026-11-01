#!/usr/bin/env bash
# Make a stack running on a REMOTE Docker daemon (e.g. the scarlet-daemon ssh:// context) reachable
# from this machine as http://localhost:<port>.
#
# Every published port in the stack is bound to 127.0.0.1 on the Docker host, and tokens carry
# iss=http://localhost:<IDP_PORT>/zuma. So browser, Postman and smoke test must all reach the stack as
# "localhost". This forwards the Docker host's loopback ports to this machine's loopback over a single
# SSH control connection. Nothing is exposed on the LAN, and PKCE keeps its localhost secure context.
#
# Usage: scripts/docker-tunnel.sh [start|stop|status]   (default: start; idempotent)
#
# No-op when the active Docker endpoint is local (unix:// / npipe://). Supports ssh:// endpoints from
# DOCKER_HOST or the current docker context. tcp:// endpoints can't be tunnelled automatically.
# Ports: WEB_PORT, GATEWAY_PORT, WALLET_PORT, TRANSACTION_PORT, IDP_PORT (defaults below).
set -euo pipefail

action="${1:-start}"

endpoint="${DOCKER_HOST:-}"
if [[ -z "$endpoint" ]]; then
  endpoint="$(docker context inspect --format '{{.Endpoints.docker.Host}}' 2>/dev/null || true)"
fi

case "$endpoint" in
  "" | unix://* | npipe://*)
    [[ "$action" == status ]] && echo "docker endpoint is local (${endpoint:-default}); no tunnel needed"
    exit 0
    ;;
  ssh://*) ;;
  *)
    echo "error: docker endpoint '${endpoint}' is remote but not ssh:// — forward the ports yourself, e.g." >&2
    echo "       ssh -N -L 127.0.0.1:8080:127.0.0.1:8080 ... <docker-host>" >&2
    exit 1
    ;;
esac

ports=(
  "${WEB_PORT:-8080}"
  "${WALLET_PORT:-3001}"
  "${TRANSACTION_PORT:-3002}"
  "${GATEWAY_PORT:-3003}"
  "${IDP_PORT:-8090}"
)

# OpenSSH accepts ssh://[user@]host[:port] destinations directly; strip any path component.
destination="ssh://${endpoint#ssh://}"
destination="${destination%%/}"
control_dir="${TMPDIR:-/tmp}"
control_socket="${control_dir%/}/zhios-docker-tunnel.sock"

ssh_opts=(
  -o BatchMode=yes
  -o StrictHostKeyChecking=accept-new
  -o ConnectTimeout=10
  -o ServerAliveInterval=30
  -o ServerAliveCountMax=3
  -o ExitOnForwardFailure=yes
  -S "$control_socket"
)

is_running() {
  ssh "${ssh_opts[@]}" -O check "$destination" >/dev/null 2>&1
}

case "$action" in
  start)
    if is_running; then
      echo "tunnel already up (${destination}): localhost ports ${ports[*]}"
      exit 0
    fi
    forwards=()
    for port in "${ports[@]}"; do
      if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
        echo "error: localhost:${port} is already in use on this machine — stop that process or override the port" >&2
        exit 1
      fi
      forwards+=(-L "127.0.0.1:${port}:127.0.0.1:${port}")
    done
    ssh "${ssh_opts[@]}" -M -f -N "${forwards[@]}" "$destination"
    echo "tunnel up (${destination}): localhost ports ${ports[*]} -> docker host loopback"
    echo "stop it with: make tunnel-stop"
    ;;
  stop)
    if is_running; then
      ssh "${ssh_opts[@]}" -O exit "$destination" >/dev/null 2>&1
      echo "tunnel stopped (${destination})"
    else
      echo "no tunnel running"
    fi
    ;;
  status)
    if is_running; then
      echo "tunnel up (${destination}): localhost ports ${ports[*]}"
    else
      echo "tunnel down (docker endpoint ${destination})"
      exit 1
    fi
    ;;
  *)
    echo "usage: $0 [start|stop|status]" >&2
    exit 2
    ;;
esac
