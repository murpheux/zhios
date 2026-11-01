output "urls" {
  description = "Host URLs of the local stack (bound to var.bind_address on the Docker host)."
  value = {
    web_spa             = local.web_origin
    graphql_gateway     = local.gateway_graphql
    wallet_service      = "http://localhost:${var.wallet_port}"
    transaction_service = "http://localhost:${var.transaction_port}"
    wallet_docs         = "http://localhost:${var.wallet_port}/docs"
    transaction_docs    = "http://localhost:${var.transaction_port}/docs"
  }
}

output "oidc" {
  description = "Mock OIDC provider endpoints. Tokens: iss = issuer, aud includes jwt_audience."
  value = {
    issuer         = local.oidc_issuer
    discovery      = "${local.oidc_issuer}/.well-known/openid-configuration"
    token_endpoint = "${local.oidc_issuer}/token"
    jwks_in_docker = local.jwks_uri
    jwt_audience   = local.jwt_audience
    spa_client_id  = local.spa_client_id
  }
}

output "containers" {
  description = "Container names, for docker logs / docker inspect."
  value = [
    docker_container.mongo.name,
    docker_container.mock_oidc.name,
    docker_container.wallet_service.name,
    docker_container.transaction_service.name,
    docker_container.graphql_gateway.name,
    docker_container.web_spa.name,
  ]
}
