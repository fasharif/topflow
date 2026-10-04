# Once per AWS account, before the environments: the S3 bucket that holds the environments' state,
# GitHub's OIDC identity provider, the roles CI uses to plan and apply Terraform, and the account's
# monthly budget alert.
#
# This root keeps its own state locally (it creates the bucket the others use). Its state holds no
# secrets, only names and ARNs; keep the file, or move it into the bucket afterwards with a backend
# block and `terraform init -migrate-state`. See infra/README.md.

terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.66"
    }
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = var.project
      ManagedBy = "terraform"
      Stack     = "bootstrap"
    }
  }
}

data "aws_caller_identity" "current" {}

locals {
  account_id   = data.aws_caller_identity.current.account_id
  state_bucket = "${var.project}-tfstate-${local.account_id}"
  github_sub   = "repo:${var.github_repository}"

  # Roles of the environments (infra/terraform/modules/hub names them <project>-<environment>-*).
  # The bootstrap's own roles (<project>-terraform-*) are deliberately outside these patterns.
  environment_roles = [
    "arn:aws:iam::${local.account_id}:role/${var.project}-staging-*",
    "arn:aws:iam::${local.account_id}:role/${var.project}-production-*",
  ]

  # GitHub environments whose jobs may apply Terraform. They differ from the ones the Deploy
  # workflow runs in (aws-staging, aws-production), so a deploy job cannot assume the apply role.
  apply_environments = ["aws-staging-infra", "aws-production-infra"]
}

# ── Terraform state ────────────────────────────────────────────────────────────────────────────

# Access logs of the state bucket would need a second bucket; CloudTrail already records API access.
#trivy:ignore:AVD-AWS-0089
resource "aws_s3_bucket" "state" {
  bucket = local.state_bucket

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration {
    status = "Enabled"
  }
}

# The AWS-managed KMS key protects state files at no cost; a customer-managed key adds a monthly fee.
#trivy:ignore:AVD-AWS-0132
resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    id     = "old-state-versions"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = 90
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

resource "aws_s3_bucket_policy" "state" {
  bucket = aws_s3_bucket.state.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "TlsOnly"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })

  depends_on = [aws_s3_bucket_public_access_block.state]
}

# ── GitHub Actions identity ────────────────────────────────────────────────────────────────────

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

# Plans run for pull requests and pushes to develop, so any branch of the repository can use this
# role through a pull request. ReadOnlyAccess includes no kms:Decrypt, so a plan cannot read the
# environments' SecureString parameters, and the policy below takes away the application data it
# would otherwise read: log contents and every S3 object except the Terraform state.
resource "aws_iam_role" "terraform_plan" {
  name                 = "${var.project}-terraform-plan"
  description          = "Terraform plan from GitHub Actions (${var.github_repository})"
  max_session_duration = 3600
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = { "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com" }
        StringLike = {
          "token.actions.githubusercontent.com:sub" = ["${local.github_sub}:pull_request", "${local.github_sub}:ref:refs/heads/develop"]
        }
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "terraform_plan_read_only" {
  role       = aws_iam_role.terraform_plan.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

resource "aws_iam_role_policy" "terraform_plan_state" {
  name = "state-lock"
  role = aws_iam_role.terraform_plan.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ReadState"
        Effect   = "Allow"
        Action   = ["s3:ListBucket", "s3:GetObject"]
        Resource = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"]
      },
      {
        # A plan takes the state lock, which is an object next to the state file.
        Sid      = "LockState"
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:DeleteObject"]
        Resource = "${aws_s3_bucket.state.arn}/*.tflock"
      },
    ]
  })
}

resource "aws_iam_role_policy" "terraform_plan_no_data" {
  name = "no-application-data"
  role = aws_iam_role.terraform_plan.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # Application and VPC flow logs hold request paths, client addresses and error details.
        Sid    = "NoLogContents"
        Effect = "Deny"
        Action = [
          "logs:GetLogEvents", "logs:FilterLogEvents", "logs:GetLogRecord", "logs:StartQuery",
          "logs:GetQueryResults", "logs:StartLiveTail",
        ]
        Resource = "*"
      },
      {
        # The load balancers' access logs hold client addresses and full URLs. A plan reads no
        # object other than the state (and its lock, which the policy above covers).
        Sid         = "NoObjectsButState"
        Effect      = "Deny"
        Action      = ["s3:GetObject", "s3:GetObjectVersion"]
        NotResource = "${aws_s3_bucket.state.arn}/*"
      },
    ]
  })
}

# Applies run only from a job in the aws-staging-infra or aws-production-infra GitHub environment,
# after a reviewer approves it. PowerUserAccess covers every service the environments use, which
# makes this a broad role: the environment approval is its main control. IAM is the exception:
# PowerUserAccess grants none, and the policy below lets the role manage only the environments'
# roles, and only when they carry the workload boundary.
resource "aws_iam_role" "terraform_apply" {
  name                 = "${var.project}-terraform-apply"
  description          = "Terraform apply from GitHub Actions (${var.github_repository}), approved environments only"
  max_session_duration = 3600
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          "token.actions.githubusercontent.com:sub" = [for environment in local.apply_environments : "${local.github_sub}:environment:${environment}"]
        }
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "terraform_apply_power_user" {
  role       = aws_iam_role.terraform_apply.name
  policy_arn = "arn:aws:iam::aws:policy/PowerUserAccess"
}

resource "aws_iam_role_policy" "terraform_apply_iam" {
  name = "environment-roles"
  role = aws_iam_role.terraform_apply.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # A role can be created, or given permissions, only with the workload boundary attached,
        # so whatever policy it receives, it can never do more than the boundary allows.
        Sid       = "BoundedEnvironmentRoles"
        Effect    = "Allow"
        Action    = ["iam:CreateRole", "iam:PutRolePolicy", "iam:DeleteRolePolicy", "iam:PutRolePermissionsBoundary"]
        Resource  = local.environment_roles
        Condition = { StringEquals = { "iam:PermissionsBoundary" = aws_iam_policy.workload_boundary.arn } }
      },
      {
        Sid    = "EnvironmentRoles"
        Effect = "Allow"
        Action = [
          "iam:GetRole", "iam:UpdateRole", "iam:UpdateAssumeRolePolicy", "iam:DeleteRole", "iam:TagRole",
          "iam:UntagRole", "iam:ListRolePolicies", "iam:ListAttachedRolePolicies", "iam:GetRolePolicy",
          "iam:ListInstanceProfilesForRole", "iam:PassRole",
        ]
        Resource = local.environment_roles
      },
      {
        Sid      = "ReadIdentityProvider"
        Effect   = "Allow"
        Action   = ["iam:GetOpenIDConnectProvider", "iam:ListOpenIDConnectProviders"]
        Resource = "*"
      },
      {
        # Nothing above reaches these, and PowerUserAccess grants no IAM changes; the explicit deny
        # keeps it that way if either ever widens.
        Sid    = "ProtectBootstrap"
        Effect = "Deny"
        Action = [
          "iam:AttachRolePolicy", "iam:DetachRolePolicy", "iam:PutRolePolicy", "iam:DeleteRolePolicy",
          "iam:UpdateAssumeRolePolicy", "iam:PutRolePermissionsBoundary", "iam:DeleteRolePermissionsBoundary",
          "iam:DeleteRole", "iam:CreatePolicyVersion", "iam:DeletePolicy", "iam:DeletePolicyVersion",
          "iam:SetDefaultPolicyVersion",
        ]
        Resource = [aws_iam_role.terraform_plan.arn, aws_iam_role.terraform_apply.arn, aws_iam_policy.workload_boundary.arn]
      },
    ]
  })
}

# The most any role of an environment may do: what the ECS execution role, the VPC flow logs role
# and the deploy role need (the task roles have no permissions at all). Terraform in the
# environments attaches it to every role it creates (modules/hub, local.permissions_boundary).
resource "aws_iam_policy" "workload_boundary" {
  name        = "${var.project}-workload-boundary"
  description = "Permissions boundary of every role in the ${var.project} environments"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "Logs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogStreams", "logs:GetLogEvents"]
        Resource = "arn:aws:logs:*:${local.account_id}:log-group:/${var.project}/*"
      },
      {
        Sid      = "SecretsAndReleaseTags"
        Effect   = "Allow"
        Action   = ["ssm:GetParameter", "ssm:GetParameters", "ssm:PutParameter"]
        Resource = "arn:aws:ssm:*:${local.account_id}:parameter/${var.project}/*"
      },
      {
        Sid      = "DecryptSecrets"
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = "arn:aws:kms:*:${local.account_id}:key/*"
      },
      {
        Sid    = "Releases"
        Effect = "Allow"
        Action = [
          "ecs:DescribeTaskDefinition", "ecs:RegisterTaskDefinition", "ecs:DescribeServices", "ecs:UpdateService",
          "ecs:RunTask", "ecs:DescribeTasks", "application-autoscaling:DescribeScalableTargets",
        ]
        Resource = "*"
      },
      {
        Sid      = "PassEnvironmentRoles"
        Effect   = "Allow"
        Action   = ["iam:PassRole"]
        Resource = local.environment_roles
      },
    ]
  })
}

# ── Cost guard ─────────────────────────────────────────────────────────────────────────────────

resource "aws_budgets_budget" "monthly" {
  name         = "${var.project}-monthly"
  budget_type  = "COST"
  limit_amount = format("%.2f", var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  dynamic "notification" {
    for_each = [
      { threshold = 50, type = "ACTUAL" },
      { threshold = 80, type = "ACTUAL" },
      { threshold = 100, type = "ACTUAL" },
      { threshold = 100, type = "FORECASTED" },
    ]
    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value.threshold
      threshold_type             = "PERCENTAGE"
      notification_type          = notification.value.type
      subscriber_email_addresses = var.budget_emails
    }
  }
}
