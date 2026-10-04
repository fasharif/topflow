# One TopFlow Hub environment on AWS: the API and the web app on ECS Fargate behind an Application
# Load Balancer, with secrets in SSM Parameter Store, logs and alarms in CloudWatch, and a role the
# deploy workflow assumes through GitHub's OIDC provider. Data and identity stay on Supabase
# (ADR-014); the reasoning for this layout is ADR-023 in docs/DECISIONS.md.
#
# Resources carry the provider's default tags (Project, Environment, ManagedBy), set by each
# environment in infra/terraform/environments.

data "aws_caller_identity" "current" {}

data "aws_region" "current" {}

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  name       = "${var.project}-${var.environment}"
  account_id = data.aws_caller_identity.current.account_id
  region     = data.aws_region.current.region

  # Two availability zones: enough for the load balancer and for a task to survive a zone outage.
  azs = slice(data.aws_availability_zones.available.names, 0, 2)

  images = {
    api     = "${var.image_registry}/${var.project}-api:${var.image_tag}"
    web     = "${var.image_registry}/${var.project}-web:${var.image_tag}"
    migrate = "${var.image_registry}/${var.project}-migrate:${var.image_tag}"
  }

  # Every role of the environment carries the account's workload boundary (created by
  # infra/terraform/bootstrap): the Terraform apply role may only create or change roles that do,
  # so no role here can ever do more than the boundary allows, whatever policy it is given.
  permissions_boundary = "arn:aws:iam::${local.account_id}:policy/${var.project}-workload-boundary"

  # The GitHub environment whose jobs may assume the deploy role. It is not the name Vercel gives
  # its deployments ("Production"), and not the one Terraform applies run in ("aws-<env>-infra").
  github_environment = "aws-${var.environment}"

  # SSM parameter paths. Terraform does not create the secret parameters (secrets.tf): it grants
  # access to these names and lists them, and an operator creates each SecureString once with
  # `aws ssm put-parameter`, so the values never reach the Terraform state.
  parameter_prefix = "/${var.project}/${var.environment}"
}
