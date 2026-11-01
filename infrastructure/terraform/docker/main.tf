# Local zhios stack on a single Docker engine — same topology as the root docker-compose.yml:
# mongo, wallet-service, transaction-service, graphql-gateway, web-spa and a mock OIDC provider.
# See README.md in this directory for the diagram, the issuer split and the secrets model.

locals {
  repo_root = abspath("${path.module}/../../..")
  zuma_dir  = "${local.repo_root}/zuma"
  gnee_dir  = "${local.repo_root}/gnee"

  # Must match deploy/mock-oidc/config.json (audience) and the IdP path segment.
  oidc_issuer_id = "zuma"
  jwt_audience   = "zuma-api"
  spa_client_id  = "gnee-web-spa"
  mock_oidc_dir  = "${local.repo_root}/deploy/mock-oidc"
  mock_oidc_hash = sha1(join("", [for f in ["Dockerfile", "server.mjs", "config.json"] : filesha1("${local.mock_oidc_dir}/${f}")]))

  # Issuer split: browser/Postman see the IdP at localhost:<idp_port> -> that is the `iss` in
  # every token, so JWT_ISSUER must be exactly that. Containers fetch the JWKS by network alias.
  oidc_issuer     = "http://localhost:${var.idp_port}/${local.oidc_issuer_id}"
  oidc_origin     = "http://localhost:${var.idp_port}"
  jwks_uri        = "http://mock-oidc:8080/${local.oidc_issuer_id}/jwks"
  web_origin      = "http://localhost:${var.web_port}"
  gateway_origin  = "http://localhost:${var.gateway_port}"
  gateway_graphql = "${local.gateway_origin}/graphql"

  mongo_uri_base = "mongodb://${urlencode(var.mongo_root_username)}:${urlencode(var.mongo_root_password)}@mongo:27017"

  labels = {
    "com.zhios.stack"      = var.name_prefix
    "com.zhios.managed-by" = "terraform"
  }

  # Rebuild triggers: hash of the files that feed each image (node_modules/dist are excluded by
  # the patterns; .dockerignore still governs what is sent to the daemon).
  zuma_build_files = sort(setunion(
    fileset(local.zuma_dir, "{package.json,package-lock.json,tsconfig*.json}"),
    fileset(local.zuma_dir, "shared/*/{package.json,tsconfig*.json}"),
    fileset(local.zuma_dir, "services/*/{package.json,tsconfig*.json}"),
    fileset(local.zuma_dir, "graphql/{package.json,tsconfig*.json}"),
    fileset(local.zuma_dir, "shared/*/src/**"),
    fileset(local.zuma_dir, "services/*/src/**"),
    fileset(local.zuma_dir, "graphql/src/**"),
    fileset(local.zuma_dir, "infrastructure/docker/*.Dockerfile"),
  ))
  zuma_src_hash = sha1(join("", [for f in local.zuma_build_files : filesha1("${local.zuma_dir}/${f}")]))

  gnee_build_files = sort(setunion(
    fileset(local.gnee_dir, "{package.json,package-lock.json,tsconfig*.json}"),
    fileset(local.gnee_dir, "packages/*/{package.json,tsconfig*.json}"),
    fileset(local.gnee_dir, "apps/web/spa/{package.json,tsconfig*.json,vite.config.ts,index.html}"),
    fileset(local.gnee_dir, "packages/*/src/**"),
    fileset(local.gnee_dir, "apps/web/spa/src/**"),
    fileset(local.gnee_dir, "apps/web/spa/public/**"),
    fileset(local.gnee_dir, "infrastructure/docker/web-spa.*"),
  ))
  gnee_src_hash = sha1(join("", [for f in local.gnee_build_files : filesha1("${local.gnee_dir}/${f}")]))

  zuma_services = toset(["wallet-service", "transaction-service", "graphql-gateway"])

  # Public, non-secret SPA build config (Authorization Code + PKCE, no client secret).
  web_spa_build_args = {
    VITE_ZUMA_GATEWAY_URL              = local.gateway_graphql
    VITE_OIDC_AUTHORITY                = local.oidc_issuer
    VITE_OIDC_CLIENT_ID                = local.spa_client_id
    VITE_OIDC_REDIRECT_URI             = "${local.web_origin}/callback"
    VITE_OIDC_POST_LOGOUT_REDIRECT_URI = local.web_origin
    VITE_OIDC_SCOPE                    = "openid profile email"
    VITE_OIDC_AUDIENCE                 = local.jwt_audience
  }

  # Mirrors x-service-env in zuma/docker-compose.yml plus the OIDC/JWKS wiring.
  zuma_common_env = [
    "NODE_ENV=development",
    "LOG_LEVEL=${var.log_level}",
    "JWT_ISSUER=${local.oidc_issuer}",
    "JWT_JWKS_URI=${local.jwks_uri}",
    "JWT_AUDIENCE=${local.jwt_audience}",
    "JWT_ALGORITHMS=RS256",
    "INTERNAL_JWT_ISSUER=zuma-internal",
    "OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318",
    "METRICS_ENABLED=true",
    "DOCS_ENABLED=true",
    "RATE_LIMIT_MAX=100",
    "RATE_LIMIT_WINDOW=1 minute",
    "RATE_LIMIT_SERVICE_MAX=1000",
    "TRUST_PROXY=false",
    "HTTP_BODY_LIMIT_BYTES=65536",
    "HTTP_CONNECTION_TIMEOUT_MS=10000",
    "HTTP_REQUEST_TIMEOUT_MS=30000",
    "SHUTDOWN_TIMEOUT_MS=10000",
  ]

  zuma_secret_env = [
    "JWT_SECRET=${var.jwt_secret}",
    "INTERNAL_JWT_SECRET=${var.internal_jwt_secret}",
    "METRICS_TOKEN=${var.metrics_token}",
  ]

  # node:22-alpine "node" user; images are built with USER node.
  node_user = "1000:1000"
}

# ---------------------------------------------------------------------------------------------
# Networks and storage
# ---------------------------------------------------------------------------------------------

# Backend: no egress, nothing published. Mongo lives only here.
resource "docker_network" "backend" {
  name     = "${var.name_prefix}-backend"
  driver   = "bridge"
  internal = true

  dynamic "labels" {
    for_each = local.labels
    content {
      label = labels.key
      value = labels.value
    }
  }
}

# Edge: containers that publish ports on bind_address.
resource "docker_network" "edge" {
  name   = "${var.name_prefix}-edge"
  driver = "bridge"

  dynamic "labels" {
    for_each = local.labels
    content {
      label = labels.key
      value = labels.value
    }
  }
}

resource "docker_volume" "mongo_data" {
  name = "${var.name_prefix}-mongo-data"

  dynamic "labels" {
    for_each = local.labels
    content {
      label = labels.key
      value = labels.value
    }
  }
  # NOTE: `make destroy` deletes this volume (and the local database) with everything else.
}

# ---------------------------------------------------------------------------------------------
# Images
# ---------------------------------------------------------------------------------------------

resource "docker_image" "mongo" {
  name         = var.mongo_image
  keep_locally = true
}

resource "docker_image" "mock_oidc" {
  name         = "${var.image_prefix}/mock-oidc:${var.image_tag}"
  keep_locally = true
  triggers     = var.build_images ? { src = local.mock_oidc_hash } : {}

  dynamic "build" {
    for_each = var.build_images ? [1] : []
    content {
      # deploy/mock-oidc: Node stdlib dev IdP with config.json baked in (no bind mounts).
      context    = local.mock_oidc_dir
      dockerfile = "Dockerfile"
      tag        = ["${var.image_prefix}/mock-oidc:${var.image_tag}"]
      builder    = var.buildx_builder
      label      = local.labels
    }
  }
}

resource "docker_image" "zuma" {
  for_each = local.zuma_services

  name         = "${var.image_prefix}/${each.key}:${var.image_tag}"
  keep_locally = true
  triggers     = var.build_images ? { src = local.zuma_src_hash } : {}

  dynamic "build" {
    for_each = var.build_images ? [1] : []
    content {
      # Build context is the zuma/ root (services import shared/* workspaces).
      context    = local.zuma_dir
      dockerfile = "infrastructure/docker/${each.key}.Dockerfile"
      tag        = ["${var.image_prefix}/${each.key}:${var.image_tag}"]
      builder    = var.buildx_builder
      label      = local.labels
    }
  }
}

resource "docker_image" "web_spa" {
  name         = "${var.image_prefix}/web-spa:${var.image_tag}"
  keep_locally = true
  triggers = var.build_images ? {
    src  = local.gnee_src_hash
    args = sha1(jsonencode(local.web_spa_build_args))
  } : {}

  dynamic "build" {
    for_each = var.build_images ? [1] : []
    content {
      context    = local.gnee_dir
      dockerfile = "infrastructure/docker/web-spa.Dockerfile"
      tag        = ["${var.image_prefix}/web-spa:${var.image_tag}"]
      builder    = var.buildx_builder
      build_args = local.web_spa_build_args
      label      = local.labels
    }
  }
}

# ---------------------------------------------------------------------------------------------
# mongo — internal network only, never published
# ---------------------------------------------------------------------------------------------

resource "docker_container" "mongo" {
  name     = "${var.name_prefix}-mongo"
  image    = docker_image.mongo.image_id
  restart  = "unless-stopped"
  must_run = true

  # Run as the image's mongodb user so the entrypoint never needs gosu/chown (hence no caps).
  user      = "999:999"
  read_only = true
  tmpfs = {
    "/tmp" = "rw,noexec,nosuid,size=64m"
  }
  security_opts = ["no-new-privileges:true"]
  capabilities {
    drop = ["ALL"]
  }

  env = [
    "MONGO_INITDB_ROOT_USERNAME=${var.mongo_root_username}",
    "MONGO_INITDB_ROOT_PASSWORD=${var.mongo_root_password}",
  ]

  volumes {
    volume_name    = docker_volume.mongo_data.name
    container_path = "/data/db"
  }

  networks_advanced {
    name    = docker_network.backend.id
    aliases = ["mongo"]
  }

  healthcheck {
    # ping needs no auth, so no credentials appear in the healthcheck's process args
    test         = ["CMD", "mongosh", "--quiet", "--eval", "db.adminCommand('ping').ok"]
    interval     = "10s"
    timeout      = "5s"
    retries      = 5
    start_period = "20s"
  }
  wait         = true
  wait_timeout = 120

  dynamic "labels" {
    for_each = merge(local.labels, { "com.zhios.service" = "mongo" })
    content {
      label = labels.key
      value = labels.value
    }
  }
}

# ---------------------------------------------------------------------------------------------
# Mock OIDC provider (DEV ONLY — signs a token for any username/client)
# ---------------------------------------------------------------------------------------------

resource "docker_container" "mock_oidc" {
  name     = "${var.name_prefix}-mock-oidc"
  image    = docker_image.mock_oidc.image_id
  restart  = "unless-stopped"
  must_run = true

  user      = "1000:1000"
  read_only = true
  tmpfs = {
    "/tmp" = "rw,noexec,nosuid,size=16m,mode=1777"
  }
  security_opts = ["no-new-privileges:true"]
  capabilities {
    drop = ["ALL"]
  }

  env = [
    # Fixed issuer (never derived from the Host header) — must equal JWT_ISSUER on the services.
    "ISSUER=${local.oidc_issuer}",
    "ALLOWED_REDIRECT_URIS=${local.web_origin}/callback",
    "ALLOWED_POST_LOGOUT_REDIRECT_URIS=${local.web_origin}",
    "ALLOWED_ORIGINS=${local.web_origin}",
  ]

  healthcheck {
    test         = ["CMD", "wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/healthz"]
    interval     = "10s"
    timeout      = "3s"
    retries      = 5
    start_period = "5s"
  }

  ports {
    internal = 8080
    external = var.idp_port
    ip       = var.bind_address
  }

  networks_advanced {
    name    = docker_network.backend.id
    aliases = ["mock-oidc"]
  }
  networks_advanced {
    name = docker_network.edge.id
  }

  dynamic "labels" {
    for_each = merge(local.labels, { "com.zhios.service" = "mock-oidc" })
    content {
      label = labels.key
      value = labels.value
    }
  }
}

# ---------------------------------------------------------------------------------------------
# zuma services
# ---------------------------------------------------------------------------------------------

resource "docker_container" "wallet_service" {
  name     = "${var.name_prefix}-wallet-service"
  image    = docker_image.zuma["wallet-service"].image_id
  restart  = "unless-stopped"
  must_run = true

  user      = local.node_user
  read_only = true
  tmpfs = {
    "/tmp" = "rw,noexec,nosuid,size=64m"
  }
  security_opts = ["no-new-privileges:true"]
  capabilities {
    drop = ["ALL"]
  }

  env = concat(local.zuma_common_env, local.zuma_secret_env, [
    "SERVICE_NAME=wallet-service",
    "PORT=3001",
    "MONGODB_URI=${local.mongo_uri_base}/zuma-wallet?authSource=admin",
    "TRANSACTION_SERVICE_URL=http://transaction-service:3002",
  ])

  ports {
    internal = 3001
    external = var.wallet_port
    ip       = var.bind_address
  }

  networks_advanced {
    name    = docker_network.backend.id
    aliases = ["wallet-service"]
  }
  networks_advanced {
    name = docker_network.edge.id
  }

  healthcheck {
    test         = ["CMD", "node", "-e", "require('http').get('http://127.0.0.1:3001/readyz',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"]
    interval     = "15s"
    timeout      = "5s"
    retries      = 5
    start_period = "15s"
  }
  wait         = true
  wait_timeout = 180

  dynamic "labels" {
    for_each = merge(local.labels, { "com.zhios.service" = "wallet-service" })
    content {
      label = labels.key
      value = labels.value
    }
  }

  depends_on = [docker_container.mongo, docker_container.mock_oidc]
}

resource "docker_container" "transaction_service" {
  name     = "${var.name_prefix}-transaction-service"
  image    = docker_image.zuma["transaction-service"].image_id
  restart  = "unless-stopped"
  must_run = true

  user      = local.node_user
  read_only = true
  tmpfs = {
    "/tmp" = "rw,noexec,nosuid,size=64m"
  }
  security_opts = ["no-new-privileges:true"]
  capabilities {
    drop = ["ALL"]
  }

  env = concat(local.zuma_common_env, local.zuma_secret_env, [
    "SERVICE_NAME=transaction-service",
    "PORT=3002",
    "MONGODB_URI=${local.mongo_uri_base}/zuma-transaction?authSource=admin",
    "WALLET_SERVICE_URL=http://wallet-service:3001",
    "BITCOIN_NETWORK=testnet",
    # Dev-only mock chain client/signer; rejected by config under NODE_ENV=production.
    "BITCOIN_ADAPTER=mock",
  ])

  ports {
    internal = 3002
    external = var.transaction_port
    ip       = var.bind_address
  }

  networks_advanced {
    name    = docker_network.backend.id
    aliases = ["transaction-service"]
  }
  networks_advanced {
    name = docker_network.edge.id
  }

  healthcheck {
    test         = ["CMD", "node", "-e", "require('http').get('http://127.0.0.1:3002/readyz',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"]
    interval     = "15s"
    timeout      = "5s"
    retries      = 5
    start_period = "15s"
  }
  wait         = true
  wait_timeout = 180

  dynamic "labels" {
    for_each = merge(local.labels, { "com.zhios.service" = "transaction-service" })
    content {
      label = labels.key
      value = labels.value
    }
  }

  depends_on = [docker_container.mongo, docker_container.mock_oidc, docker_container.wallet_service]
}

resource "docker_container" "graphql_gateway" {
  name     = "${var.name_prefix}-graphql-gateway"
  image    = docker_image.zuma["graphql-gateway"].image_id
  restart  = "unless-stopped"
  must_run = true

  user      = local.node_user
  read_only = true
  tmpfs = {
    "/tmp" = "rw,noexec,nosuid,size=64m"
  }
  security_opts = ["no-new-privileges:true"]
  capabilities {
    drop = ["ALL"]
  }

  env = concat(local.zuma_common_env, local.zuma_secret_env, [
    "SERVICE_NAME=graphql-gateway",
    "PORT=3003",
    # Unused by the gateway's own logic but required by the shared env schema
    "MONGODB_URI=${local.mongo_uri_base}/zuma-graphql?authSource=admin",
    "WALLET_SERVICE_URL=http://wallet-service:3001",
    "TRANSACTION_SERVICE_URL=http://transaction-service:3002",
    "CORS_ALLOWED_ORIGINS=${local.web_origin}",
    "CORS_ALLOW_CREDENTIALS=false",
    "UPSTREAM_TIMEOUT_MS=5000",
    "GRAPHQL_QUERY_DEPTH=8",
    "GRAPHQL_INTROSPECTION_ENABLED=true",
  ])

  ports {
    internal = 3003
    external = var.gateway_port
    ip       = var.bind_address
  }

  networks_advanced {
    name    = docker_network.backend.id
    aliases = ["graphql-gateway"]
  }
  networks_advanced {
    name = docker_network.edge.id
  }

  healthcheck {
    test         = ["CMD", "node", "-e", "require('http').get('http://127.0.0.1:3003/readyz',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"]
    interval     = "15s"
    timeout      = "5s"
    retries      = 5
    start_period = "15s"
  }
  wait         = true
  wait_timeout = 180

  dynamic "labels" {
    for_each = merge(local.labels, { "com.zhios.service" = "graphql-gateway" })
    content {
      label = labels.key
      value = labels.value
    }
  }

  depends_on = [docker_container.wallet_service, docker_container.transaction_service]
}

# ---------------------------------------------------------------------------------------------
# gnee web-spa (static nginx; talks to nothing server-side, so edge network only)
# ---------------------------------------------------------------------------------------------

resource "docker_container" "web_spa" {
  name     = "${var.name_prefix}-web-spa"
  image    = docker_image.web_spa.image_id
  restart  = "unless-stopped"
  must_run = true

  user      = "101:101"
  read_only = true
  tmpfs = {
    "/tmp" = "rw,noexec,nosuid,size=16m,mode=1777"
    # nginx entrypoint renders /etc/nginx/templates/*.template here at start
    "/etc/nginx/conf.d" = "rw,noexec,nosuid,size=1m,mode=1777" # uid 101 renders templates here
  }
  security_opts = ["no-new-privileges:true"]
  capabilities {
    drop = ["ALL"]
  }

  env = [
    "ZUMA_GATEWAY_ORIGIN=${local.gateway_origin}",
    "OIDC_AUTHORITY_ORIGIN=${local.oidc_origin}",
  ]

  ports {
    internal = 8080
    external = var.web_port
    ip       = var.bind_address
  }

  networks_advanced {
    name = docker_network.edge.id
  }

  healthcheck {
    test         = ["CMD", "wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/healthz"]
    interval     = "15s"
    timeout      = "5s"
    retries      = 5
    start_period = "10s"
  }
  wait         = true
  wait_timeout = 60

  dynamic "labels" {
    for_each = merge(local.labels, { "com.zhios.service" = "web-spa" })
    content {
      label = labels.key
      value = labels.value
    }
  }
}
