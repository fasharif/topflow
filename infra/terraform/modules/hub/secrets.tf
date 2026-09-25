# Secrets live in SSM Parameter Store as SecureString parameters encrypted with this environment's
# own KMS key. Standard parameters cost nothing; Secrets Manager would add a monthly fee per secret
# for rotation features that Supabase keys and connection strings do not use.
#
# Terraform does not create the secret parameters: a resource would copy each value into the
# Terraform state on every refresh. It creates the key, grants the execution role access to the
# parameter names below, and lists them as an output. An operator creates each one once:
#
#   aws ssm put-parameter --type SecureString --key-id alias/topflow-hub-production \
#     --name /topflow-hub/production/api/DATABASE_URL --value 'postgresql://...'
#
# A release cannot start without them: ECS refuses to start a task whose secrets are missing, and
# the release step runs before either service changes.

resource "aws_kms_key" "main" {
  description             = "${local.name}: SSM secrets, CloudWatch logs and alarm notifications"
  enable_key_rotation     = true
  deletion_window_in_days = 30

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AccountAdministration"
        Effect    = "Allow"
        Principal = { AWS = "arn:aws:iam::${local.account_id}:root" }
        Action    = "kms:*"
        Resource  = "*"
      },
      {
        Sid       = "CloudWatchLogs"
        Effect    = "Allow"
        Principal = { Service = "logs.${local.region}.amazonaws.com" }
        Action    = ["kms:Encrypt", "kms:Decrypt", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:Describe*"]
        Resource  = "*"
        Condition = {
          ArnLike = { "kms:EncryptionContext:aws:logs:arn" = "arn:aws:logs:${local.region}:${local.account_id}:log-group:*" }
        }
      },
      {
        Sid       = "AlarmNotifications"
        Effect    = "Allow"
        Principal = { Service = "cloudwatch.amazonaws.com" }
        Action    = ["kms:Decrypt", "kms:GenerateDataKey*"]
        Resource  = "*"
      },
    ]
  })
}

resource "aws_kms_alias" "main" {
  name          = "alias/${local.name}"
  target_key_id = aws_kms_key.main.key_id
}

locals {
  # Secret settings, as environment variable names. The web app reads the API's INTERNAL_API_SECRET,
  # which must be identical in both applications (ecs.tf decides which container gets which).
  secret_names      = ["DATABASE_URL", "DIRECT_URL", "SUPABASE_SECRET_KEY", "INTERNAL_API_SECRET", "RESEND_API_KEY"]
  secret_parameters = { for name in local.secret_names : "api/${name}" => "${local.parameter_prefix}/api/${name}" }
  secret_arns = {
    for key, path in local.secret_parameters : key => "arn:aws:ssm:${local.region}:${local.account_id}:parameter${path}"
  }
}

# The image tags of the running release and the one before it, kept by the deploy workflow for
# one-step rollbacks.
resource "aws_ssm_parameter" "release" {
  for_each = toset(["current", "previous"])

  name        = "${local.parameter_prefix}/release/${each.key}"
  description = "${local.name}: image tag of the ${each.key} release, written by .github/workflows/deploy.yml"
  type        = "String"
  value       = "none"

  lifecycle {
    ignore_changes = [value]
  }
}
