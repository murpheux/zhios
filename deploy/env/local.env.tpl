# Template for the git-ignored root .env used by `docker compose` (and by Terraform when no
# 1Password session is used). Holds op:// REFERENCES only — never values. Render with:
#   make secrets-op            # = scripts/inject-op-secrets.sh (umask 077, refuses to overwrite)
# Expected 1Password item: vault "zuma", item "local-stack", one field per key below.
# Use letters/digits only (>= 32 chars): MONGO_ROOT_PASSWORD is embedded in a MongoDB URI.
# Without 1Password, run `make secrets-local` instead (openssl-generated values).
MONGO_ROOT_USERNAME=zuma_admin
MONGO_ROOT_PASSWORD={{ op://zuma/local-stack/mongo_root_password }}
JWT_SECRET={{ op://zuma/local-stack/jwt_secret }}
INTERNAL_JWT_SECRET={{ op://zuma/local-stack/internal_jwt_secret }}
METRICS_TOKEN={{ op://zuma/local-stack/metrics_token }}
