# wallet-service wrapped for API Gateway + Lambda via @fastify/aws-lambda
# (services/wallet-service/src/lambda-handler.ts).
#
# Packaging: run `scripts/package-lambda.sh` (from zuma/) BEFORE plan/apply. It builds the
# monorepo and stages dist/ + a production-only node_modules (from package-lock.json, with the
# @zuma/shared-* workspaces materialised as real directories) into .build/wallet-service-lambda,
# which archive_file zips below. Zipping dist/ alone would ship no dependencies at all.
locals {
  wallet_lambda_log_group_name = "/aws/lambda/zuma-${var.environment}-wallet-service"
  wallet_lambda_package_dir    = coalesce(var.wallet_lambda_package_dir, "${path.module}/.build/wallet-service-lambda")
}

data "archive_file" "wallet_lambda_zip" {
  type        = "zip"
  source_dir  = local.wallet_lambda_package_dir
  output_path = "${path.module}/.build/wallet-service-lambda.zip"
}

resource "aws_iam_role" "wallet_lambda_exec" {
  name = "zuma-${var.environment}-wallet-lambda-exec"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "wallet_lambda_basic_exec" {
  role       = aws_iam_role.wallet_lambda_exec.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# VPC-attached Lambdas need ENI management permissions.
resource "aws_iam_role_policy_attachment" "wallet_lambda_vpc_access" {
  count      = length(var.lambda_subnet_ids) > 0 ? 1 : 0
  role       = aws_iam_role.wallet_lambda_exec.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

# Least-privilege runtime reads: the two named secrets and the one named parameter only. KMS
# grants are added only for customer-managed keys, and are pinned via kms:ViaService plus the
# encryption context each service sets, so the key can't be used for anything else.
resource "aws_iam_role_policy" "wallet_lambda_secrets_read" {
  name = "zuma-${var.environment}-wallet-lambda-secrets-read"
  role = aws_iam_role.wallet_lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat(
      [
        {
          Sid      = "ReadJwtSecrets"
          Effect   = "Allow"
          Action   = ["secretsmanager:GetSecretValue"]
          Resource = [data.aws_secretsmanager_secret.jwt_secret.arn, data.aws_secretsmanager_secret.internal_jwt_secret.arn]
        },
        {
          Sid      = "ReadMongoUriParameter"
          Effect   = "Allow"
          Action   = ["ssm:GetParameter"]
          Resource = [local.mongo_uri_parameter_arn]
        },
      ],
      var.mongo_uri_kms_key_arn == null ? [] : [{
        Sid      = "DecryptMongoUriParameter"
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = [var.mongo_uri_kms_key_arn]
        Condition = {
          StringEquals = {
            "kms:ViaService"                      = "ssm.${data.aws_region.current.name}.amazonaws.com"
            "kms:EncryptionContext:PARAMETER_ARN" = local.mongo_uri_parameter_arn
          }
        }
      }],
      var.secrets_kms_key_arn == null ? [] : [{
        Sid      = "DecryptJwtSecrets"
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = [var.secrets_kms_key_arn]
        Condition = {
          StringEquals = {
            "kms:ViaService" = "secretsmanager.${data.aws_region.current.name}.amazonaws.com"
          }
          "ForAnyValue:StringEquals" = {
            "kms:EncryptionContext:SecretARN" = [data.aws_secretsmanager_secret.jwt_secret.arn, data.aws_secretsmanager_secret.internal_jwt_secret.arn]
          }
        }
      }],
    )
  })
}

resource "aws_lambda_function" "wallet_service" {
  function_name = "zuma-${var.environment}-wallet-service"
  role          = aws_iam_role.wallet_lambda_exec.arn
  handler       = "lambda-handler.handler"
  runtime       = "nodejs22.x"
  timeout       = 15
  memory_size   = 256

  filename         = data.archive_file.wallet_lambda_zip.output_path
  source_code_hash = data.archive_file.wallet_lambda_zip.output_base64sha256

  tracing_config {
    mode = "Active"
  }

  # Empty defaults keep this plannable out of the box — production must supply real private subnets/SGs.
  vpc_config {
    subnet_ids         = var.lambda_subnet_ids
    security_group_ids = var.lambda_security_group_ids
  }

  depends_on = [aws_cloudwatch_log_group.wallet_lambda]

  environment {
    variables = {
      NODE_ENV = var.environment == "prod" ? "production" : "development"
      # Required by the shared env schema; Lambda never binds it (API Gateway invokes the handler)
      PORT                = "3001"
      SERVICE_NAME        = "wallet-service"
      LOG_LEVEL           = "info"
      JWT_ISSUER          = "zuma"
      DOCS_ENABLED        = "false"
      INTERNAL_JWT_ISSUER = "zuma-internal"
      # API Gateway sits in front: trust X-Forwarded-* for client IPs
      TRUST_PROXY             = "true"
      RATE_LIMIT_MAX          = "100"
      RATE_LIMIT_WINDOW       = "1 minute"
      HTTP_BODY_LIMIT_BYTES   = "65536"
      METRICS_ENABLED         = "false"
      TRANSACTION_SERVICE_URL = var.transaction_service_url
      # Only identifiers live here (and in state) — never values. lambda-handler.ts resolves
      # them at cold start: JWT_SECRET_ARN / MONGODB_URI_PARAMETER_NAME are already handled;
      # INTERNAL_JWT_SECRET_ARN needs the same treatment (see infrastructure/README.md).
      JWT_SECRET_ARN             = data.aws_secretsmanager_secret.jwt_secret.arn
      INTERNAL_JWT_SECRET_ARN    = data.aws_secretsmanager_secret.internal_jwt_secret.arn
      MONGODB_URI_PARAMETER_NAME = var.mongo_uri_parameter_name
    }
  }
}

resource "aws_cloudwatch_log_group" "wallet_lambda" {
  name              = local.wallet_lambda_log_group_name
  retention_in_days = var.log_retention_days
}

resource "aws_apigatewayv2_api" "wallet_http_api" {
  name          = "zuma-${var.environment}-wallet-http-api"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_integration" "wallet_lambda" {
  api_id                 = aws_apigatewayv2_api.wallet_http_api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.wallet_service.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "wallet_proxy" {
  api_id    = aws_apigatewayv2_api.wallet_http_api.id
  route_key = "ANY /{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.wallet_lambda.id}"
}

# HTTP APIs write access logs via a service-linked role — no account-level CloudWatch role needed.
resource "aws_cloudwatch_log_group" "wallet_api_access" {
  name              = "/aws/apigateway/zuma-${var.environment}-wallet-http-api"
  retention_in_days = var.log_retention_days
}

resource "aws_apigatewayv2_stage" "wallet_default" {
  api_id      = aws_apigatewayv2_api.wallet_http_api.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_burst_limit = 50
    throttling_rate_limit  = 25
  }

  # No headers/query strings/auth context logged — avoids writing bearer tokens to CloudWatch.
  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.wallet_api_access.arn
    format = jsonencode({
      requestId          = "$context.requestId"
      requestTime        = "$context.requestTime"
      sourceIp           = "$context.identity.sourceIp"
      httpMethod         = "$context.httpMethod"
      routeKey           = "$context.routeKey"
      path               = "$context.path"
      status             = "$context.status"
      protocol           = "$context.protocol"
      responseLength     = "$context.responseLength"
      responseLatency    = "$context.responseLatency"
      integrationStatus  = "$context.integrationStatus"
      integrationLatency = "$context.integrationLatency"
      integrationError   = "$context.integrationErrorMessage"
      userAgent          = "$context.identity.userAgent"
    })
  }
}

resource "aws_lambda_permission" "apigw_invoke_wallet" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.wallet_service.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.wallet_http_api.execution_arn}/*/*"
}
