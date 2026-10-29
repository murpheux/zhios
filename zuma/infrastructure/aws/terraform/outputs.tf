output "cluster_endpoint" {
  description = "EKS API server endpoint"
  value       = module.eks.cluster_endpoint
}

output "cluster_name" {
  value = module.eks.cluster_name
}

output "cluster_oidc_issuer_url" {
  description = "Used to configure IRSA roles for in-cluster service accounts"
  value       = module.eks.cluster_oidc_issuer_url
}

output "wallet_lambda_function_name" {
  value = aws_lambda_function.wallet_service.function_name
}

output "wallet_api_gateway_endpoint" {
  value = aws_apigatewayv2_api.wallet_http_api.api_endpoint
}
