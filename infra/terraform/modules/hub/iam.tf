# Roles: one execution role for ECS itself (pull images, write logs, read this environment's
# secrets), a task role per application with no AWS permissions (the applications call no AWS APIs),
# and the role the deploy workflow assumes through GitHub's OIDC provider.

locals {
  ecs_tasks_trust = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
      Condition = {
        StringEquals = { "aws:SourceAccount" = local.account_id }
        ArnLike      = { "aws:SourceArn" = "arn:aws:ecs:${local.region}:${local.account_id}:*" }
      }
    }]
  })
}

resource "aws_iam_role" "execution" {
  name                 = "${local.name}-ecs-execution"
  assume_role_policy   = local.ecs_tasks_trust
  permissions_boundary = local.permissions_boundary
}

resource "aws_iam_role_policy" "execution" {
  name = "logs-and-secrets"
  role = aws_iam_role.execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "WriteLogs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = [for group in aws_cloudwatch_log_group.app : "${group.arn}:*"]
      },
      {
        Sid      = "ReadSecrets"
        Effect   = "Allow"
        Action   = ["ssm:GetParameters"]
        Resource = values(local.secret_arns)
      },
      {
        Sid      = "DecryptSecrets"
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = [aws_kms_key.main.arn]
      },
    ]
  })
}

resource "aws_iam_role" "task" {
  for_each = toset(["api", "web", "migrate"])

  name                 = "${local.name}-${each.key}-task"
  description          = "Runtime identity of the ${each.key} containers; deliberately without permissions"
  assume_role_policy   = local.ecs_tasks_trust
  permissions_boundary = local.permissions_boundary
}

# ── Deploy role for .github/workflows/deploy.yml ──────────────────────────────────────────────
# Only a job running in this repository's GitHub environment aws-<environment> can assume it; that
# environment requires a reviewer's approval before the job starts.

data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

resource "aws_iam_role" "deploy" {
  name                 = "${local.name}-github-deploy"
  description          = "Assumed by the deploy workflow of ${var.github_repository} in the ${local.github_environment} environment"
  max_session_duration = 3600
  permissions_boundary = local.permissions_boundary
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = data.aws_iam_openid_connect_provider.github.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_repository}:environment:${local.github_environment}"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "deploy" {
  name = "deploy-releases"
  role = aws_iam_role.deploy.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # Registering task definitions cannot be limited to a resource (an AWS restriction).
        Sid      = "TaskDefinitions"
        Effect   = "Allow"
        Action   = ["ecs:DescribeTaskDefinition", "ecs:RegisterTaskDefinition"]
        Resource = "*"
      },
      {
        Sid      = "UpdateServices"
        Effect   = "Allow"
        Action   = ["ecs:DescribeServices", "ecs:UpdateService"]
        Resource = [for service in aws_ecs_service.app : service.id]
      },
      {
        # The first release starts each service at its auto scaling minimum. Describe calls of
        # Application Auto Scaling cannot be limited to a resource.
        Sid      = "ReadScalingLimits"
        Effect   = "Allow"
        Action   = ["application-autoscaling:DescribeScalableTargets"]
        Resource = "*"
      },
      {
        Sid      = "RunReleaseStep"
        Effect   = "Allow"
        Action   = ["ecs:RunTask"]
        Resource = "arn:aws:ecs:${local.region}:${local.account_id}:task-definition/${local.name}-migrate:*"
        Condition = {
          ArnEquals = { "ecs:cluster" = aws_ecs_cluster.main.arn }
        }
      },
      {
        Sid      = "WatchReleaseStep"
        Effect   = "Allow"
        Action   = ["ecs:DescribeTasks"]
        Resource = "arn:aws:ecs:${local.region}:${local.account_id}:task/${aws_ecs_cluster.main.name}/*"
      },
      {
        Sid      = "PassTaskRoles"
        Effect   = "Allow"
        Action   = ["iam:PassRole"]
        Resource = concat([aws_iam_role.execution.arn], [for role in aws_iam_role.task : role.arn])
        Condition = {
          StringEquals = { "iam:PassedToService" = "ecs-tasks.amazonaws.com" }
        }
      },
      {
        Sid      = "ReleaseTags"
        Effect   = "Allow"
        Action   = ["ssm:GetParameter", "ssm:PutParameter"]
        Resource = [for parameter in aws_ssm_parameter.release : parameter.arn]
      },
      {
        Sid      = "ReadReleaseStepLogs"
        Effect   = "Allow"
        Action   = ["logs:GetLogEvents"]
        Resource = "${aws_cloudwatch_log_group.app["migrate"].arn}:*"
      },
    ]
  })
}
