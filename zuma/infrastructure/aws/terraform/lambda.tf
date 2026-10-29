# Example: wallet-service wrapped for API Gateway + Lambda via @fastify/aws-lambda.
# Requires services/wallet-service/src/lambda-handler.ts (added) and its build output
# zipped from services/wallet-service/dist + node_modules — not wired up here, see README.
locals {
  wallet_lambda_log_group_name = "/aws/lambda/zuma-${var.environment}-wallet-service"
}

data "archive_file" "wallet_lambda_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../../../services/wallet-service/dist"
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
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Least-privilege read access to the referenced secret/parameter only — no wildcard resources.
resource "aws_iam_role_policy" "wallet_lambda_secrets_read" {
  name = "zuma-${var.environment}-wallet-lambda-secrets-read"
  role = aws_iam_role.wallet_lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = [data.aws_secretsmanager_secret.jwt_secret.arn]
      },
      {
        Effect   = "Allow"
        Action   = ["ssm:GetParameter"]
        Resource = [data.aws_ssm_parameter.mongo_uri.arn]
      }
    ]
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

  # Empty defaults keep this plannable out of the box — production must supply real private subnets/SGs.
  vpc_config {
    subnet_ids         = var.lambda_subnet_ids
    security_group_ids = var.lambda_security_group_ids
  }

  depends_on = [aws_cloudwatch_log_group.wallet_lambda]

  environment {
    variables = {
      NODE_ENV                = var.environment == "prod" ? "production" : "development"
      LOG_LEVEL               = "info"
      JWT_ISSUER              = "zuma"
      TRANSACTION_SERVICE_URL = "https://internal.zuma.example.com/transaction"
      # Lambda reads the actual secret values at runtime via the AWS SDK, not via these env vars —
      # JWT_SECRET/MONGODB_URI should be fetched in lambda-handler.ts using the ARNs below.
      JWT_SECRET_ARN             = data.aws_secretsmanager_secret.jwt_secret.arn
      MONGODB_URI_PARAMETER_NAME = data.aws_ssm_parameter.mongo_uri.name
    }
  }
}

resource "aws_cloudwatch_log_group" "wallet_lambda" {
  name              = local.wallet_lambda_log_group_name
  retention_in_days = 30
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

resource "aws_apigatewayv2_stage" "wallet_default" {
  api_id      = aws_apigatewayv2_api.wallet_http_api.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_burst_limit = 50
    throttling_rate_limit  = 25
  }
}

resource "aws_lambda_permission" "apigw_invoke_wallet" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.wallet_service.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.wallet_http_api.execution_arn}/*/*"
}
