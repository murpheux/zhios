#!/usr/bin/env bash
# Runs Terraform for the local Docker deploy (infrastructure/terraform/docker) with secrets
# injected at execution time — never written to tfvars, never printed.
#
# Usage: scripts/terraform-run.sh {init|validate|plan|apply|destroy|output} [extra terraform args]
#
# Secret source (SECRETS_SOURCE):
#   op      op run --env-file=deploy/env/terraform.env.tpl -- terraform ...   (1Password)
#   dotenv  reads MONGO_ROOT_*, JWT_SECRET, INTERNAL_JWT_SECRET, METRICS_TOKEN from the root
#           .env (make secrets-local / make secrets-op) and exports them as TF_VAR_*
#   auto    (default) dotenv if the root .env exists, otherwise op
#
# Docker endpoint: TF_VAR_docker_host wins; else $DOCKER_HOST; else the current docker
# context's endpoint (e.g. unix:///Users/<you>/.docker/run/docker.sock on Docker Desktop).
#
# apply/destroy are always interactive (Terraform's own "yes" prompt; -input=false is not
# used there because it would require -auto-approve) — no -auto-approve, no
# saved plan files (a saved plan would hold the secrets in plaintext). destroy additionally
# requires CONFIRM=yes.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tf_dir="${repo_root}/infrastructure/terraform/docker"
op_env_file="${repo_root}/deploy/env/terraform.env.tpl"
dotenv_file="${ZHIOS_ENV_FILE:-${repo_root}/.env}"
tf_bin="${TERRAFORM:-terraform}"

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

usage() {
  sed -n '2,/^set -euo pipefail/{/^#/s/^# \{0,1\}//p;}' "${BASH_SOURCE[0]}"
  exit 2
}

[[ $# -ge 1 ]] || usage
cmd="$1"
shift

command -v "$tf_bin" >/dev/null 2>&1 || die "${tf_bin} not found (brew install terraform, or TERRAFORM=tofu)"

# Every file Terraform creates here (state, backups, lock) is owner-only.
umask 077

secure_state() {
  local f
  for f in "${tf_dir}/terraform.tfstate" "${tf_dir}/terraform.tfstate.backup"; do
    if [[ -f "$f" ]]; then
      chmod 600 "$f"
    fi
  done
}
trap secure_state EXIT

resolve_docker_host() {
  if [[ -n "${TF_VAR_docker_host:-}" ]]; then
    return 0
  fi
  local host="${DOCKER_HOST:-}"
  if [[ -z "$host" ]] && command -v docker >/dev/null 2>&1; then
    host="$(docker context inspect --format '{{.Endpoints.docker.Host}}' 2>/dev/null || true)"
  fi
  if [[ -n "$host" ]]; then
    export TF_VAR_docker_host="$host"
  fi
  printf 'docker_host: %s\n' "${TF_VAR_docker_host:-<variable default>}" >&2
}

# Parses KEY=VALUE lines without evaluating them (no `source`: a .env must never execute code).
load_dotenv() {
  [[ -f "$dotenv_file" ]] || die "${dotenv_file} not found — run 'make secrets-local' or 'make secrets-op', or SECRETS_SOURCE=op"
  local line key value tf_name
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*(#|$) ]] && continue
    [[ "$line" =~ ^[[:space:]]*(export[[:space:]]+)?([A-Z_][A-Z0-9_]*)=(.*)$ ]] || continue
    key="${BASH_REMATCH[2]}"
    value="${BASH_REMATCH[3]}"
    if [[ "$value" =~ ^\"(.*)\"$ || "$value" =~ ^\'(.*)\'$ ]]; then
      value="${BASH_REMATCH[1]}"
    fi
    case "$key" in
      MONGO_ROOT_USERNAME) tf_name=TF_VAR_mongo_root_username ;;
      MONGO_ROOT_PASSWORD) tf_name=TF_VAR_mongo_root_password ;;
      JWT_SECRET) tf_name=TF_VAR_jwt_secret ;;
      INTERNAL_JWT_SECRET) tf_name=TF_VAR_internal_jwt_secret ;;
      METRICS_TOKEN) tf_name=TF_VAR_metrics_token ;;
      *) continue ;;
    esac
    export "${tf_name}=${value}"
  done <"$dotenv_file"
  local required
  for required in TF_VAR_mongo_root_password TF_VAR_jwt_secret TF_VAR_internal_jwt_secret TF_VAR_metrics_token; do
    [[ -n "${!required:-}" ]] || die "${dotenv_file} is missing a value for ${required#TF_VAR_} (upper-case key)"
  done
}

run_with_secrets() {
  local source="${SECRETS_SOURCE:-auto}"
  if [[ "$source" == "auto" ]]; then
    if [[ -f "$dotenv_file" ]]; then source=dotenv; else source=op; fi
  fi
  case "$source" in
    dotenv)
      printf 'secrets: %s\n' "${dotenv_file#"${repo_root}/"}" >&2
      load_dotenv
      "$tf_bin" -chdir="$tf_dir" "$@"
      ;;
    op)
      command -v op >/dev/null 2>&1 || die "1Password CLI (op) not found; run 'make secrets-local' to use a local .env instead"
      printf 'secrets: 1Password via %s\n' "${op_env_file#"${repo_root}/"}" >&2
      op run --env-file="$op_env_file" -- "$tf_bin" -chdir="$tf_dir" "$@"
      ;;
    *) die "SECRETS_SOURCE must be auto, op or dotenv (got: ${source})" ;;
  esac
}

case "$cmd" in
  init)
    "$tf_bin" -chdir="$tf_dir" init -input=false "$@"
    ;;
  validate)
    "$tf_bin" -chdir="$tf_dir" validate "$@"
    ;;
  output)
    "$tf_bin" -chdir="$tf_dir" output "$@"
    ;;
  plan)
    resolve_docker_host
    run_with_secrets plan -input=false "$@"
    ;;
  apply)
    resolve_docker_host
    run_with_secrets apply "$@"
    ;;
  destroy)
    [[ "${CONFIRM:-}" == "yes" ]] || die "refusing to destroy without CONFIRM=yes (e.g. make destroy CONFIRM=yes); Terraform will still ask you to type 'yes'"
    resolve_docker_host
    run_with_secrets destroy "$@"
    ;;
  *)
    usage
    ;;
esac
