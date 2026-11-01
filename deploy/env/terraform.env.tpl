# op run env file for the Terraform docker deploy — op:// REFERENCES only, never values:
#   op run --env-file=deploy/env/terraform.env.tpl -- terraform -chdir=infrastructure/terraform/docker apply
# (`make deploy` does this when no root .env exists, or with SECRETS_SOURCE=op.)
# Same 1Password item as deploy/env/local.env.tpl: vault "zuma", item "local-stack".
TF_VAR_mongo_root_username=zuma_admin
TF_VAR_mongo_root_password=op://zuma/local-stack/mongo_root_password
TF_VAR_jwt_secret=op://zuma/local-stack/jwt_secret
TF_VAR_internal_jwt_secret=op://zuma/local-stack/internal_jwt_secret
TF_VAR_metrics_token=op://zuma/local-stack/metrics_token
