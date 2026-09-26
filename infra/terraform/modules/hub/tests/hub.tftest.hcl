# Unit tests of the environment module, run with `terraform test` against a mocked AWS provider:
# nothing is created and no credentials are needed. They pin down the properties the rest of the
# delivery pipeline relies on: secrets only through SSM, read-only containers, the release step,
# HTTPS, the deploy role's trust, alarms and input validation.

mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = { account_id = "123456789012" }
  }
  mock_data "aws_region" {
    defaults = { region = "ap-south-1", name = "ap-south-1" }
  }
  mock_data "aws_availability_zones" {
    defaults = { names = ["ap-south-1a", "ap-south-1b", "ap-south-1c"] }
  }
  mock_data "aws_elb_service_account" {
    defaults = { arn = "arn:aws:iam::718504428378:root" }
  }
  mock_data "aws_iam_openid_connect_provider" {
    defaults = { arn = "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::123456789012:role/mock" }
  }
  mock_resource "aws_kms_key" {
    defaults = { arn = "arn:aws:kms:ap-south-1:123456789012:key/11111111-2222-3333-4444-555555555555" }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = { arn = "arn:aws:logs:ap-south-1:123456789012:log-group:mock" }
  }
  mock_resource "aws_ecs_cluster" {
    defaults = { arn = "arn:aws:ecs:ap-south-1:123456789012:cluster/mock" }
  }
  mock_resource "aws_sns_topic" {
    defaults = { arn = "arn:aws:sns:ap-south-1:123456789012:mock" }
  }
  mock_resource "aws_s3_bucket" {
    defaults = { arn = "arn:aws:s3:::mock" }
  }
  mock_resource "aws_ssm_parameter" {
    defaults = { arn = "arn:aws:ssm:ap-south-1:123456789012:parameter/mock" }
  }
  mock_resource "aws_lb" {
    defaults = {
      arn        = "arn:aws:elasticloadbalancing:ap-south-1:123456789012:loadbalancer/app/mock/1234567890abcdef"
      arn_suffix = "app/mock/1234567890abcdef"
    }
  }
  mock_resource "aws_lb_listener" {
    defaults = { arn = "arn:aws:elasticloadbalancing:ap-south-1:123456789012:listener/app/mock/1234567890abcdef/1234567890abcdef" }
  }
  mock_resource "aws_lb_target_group" {
    defaults = {
      arn        = "arn:aws:elasticloadbalancing:ap-south-1:123456789012:targetgroup/mock/1234567890abcdef"
      arn_suffix = "targetgroup/mock/1234567890abcdef"
    }
  }
  mock_resource "aws_ecs_task_definition" {
    defaults = { arn = "arn:aws:ecs:ap-south-1:123456789012:task-definition/mock:1" }
  }
  mock_resource "aws_ecs_service" {
    defaults = { id = "arn:aws:ecs:ap-south-1:123456789012:service/mock/mock" }
  }
}

variables {
  environment              = "staging"
  web_domain               = "staging.hub.example.com"
  api_domain               = "api.staging.hub.example.com"
  certificate_arn          = "arn:aws:acm:ap-south-1:123456789012:certificate/00000000-0000-0000-0000-000000000000"
  supabase_url             = "https://abcdefghijklmnopqrst.supabase.co"
  supabase_publishable_key = "sb_publishable_test"
}

run "staging_defaults" {
  command = apply

  assert {
    condition     = length(aws_subnet.public) == 2 && aws_subnet.public[0].availability_zone != aws_subnet.public[1].availability_zone
    error_message = "The environment needs two public subnets in different availability zones."
  }

  assert {
    condition = alltrue([
      for app in ["api", "web", "migrate"] : alltrue([
        for variable in jsondecode(aws_ecs_task_definition.app[app].container_definitions)[0].environment :
        !contains(["DATABASE_URL", "DIRECT_URL", "SUPABASE_SECRET_KEY", "INTERNAL_API_SECRET", "RESEND_API_KEY"], variable.name)
      ])
    ])
    error_message = "A secret was passed as a plain environment variable."
  }

  assert {
    condition = (
      sort([for secret in jsondecode(aws_ecs_task_definition.app["api"].container_definitions)[0].secrets : secret.name]) == sort(["DATABASE_URL", "SUPABASE_SECRET_KEY", "INTERNAL_API_SECRET", "RESEND_API_KEY"])
      && [for secret in jsondecode(aws_ecs_task_definition.app["web"].container_definitions)[0].secrets : secret.name] == ["INTERNAL_API_SECRET"]
      && contains([for secret in jsondecode(aws_ecs_task_definition.app["migrate"].container_definitions)[0].secrets : secret.name], "DIRECT_URL")
    )
    error_message = "Each container must receive exactly the secrets it needs from SSM."
  }

  assert {
    condition = alltrue([
      for secret in jsondecode(aws_ecs_task_definition.app["api"].container_definitions)[0].secrets :
      startswith(secret.valueFrom, "arn:aws:ssm:ap-south-1:123456789012:parameter/topflow-hub/staging/api/")
    ])
    error_message = "API secrets must come from this environment's SSM parameters."
  }

  assert {
    condition = (
      jsondecode(aws_ecs_task_definition.app["api"].container_definitions)[0].readonlyRootFilesystem == true
      && jsondecode(aws_ecs_task_definition.app["migrate"].container_definitions)[0].readonlyRootFilesystem == true
      && alltrue([for app in ["api", "web", "migrate"] : jsondecode(aws_ecs_task_definition.app[app].container_definitions)[0].user == "1000:1000"])
    )
    error_message = "Containers must run as the unprivileged user, the API and release step on a read-only file system."
  }

  assert {
    condition = (
      jsondecode(aws_ecs_task_definition.app["migrate"].container_definitions)[0].command == ["release"]
      && jsondecode(aws_ecs_task_definition.app["migrate"].container_definitions)[0].image == "ghcr.io/fasharif/topflow-hub-migrate:develop"
      && jsondecode(aws_ecs_task_definition.app["api"].container_definitions)[0].image == "ghcr.io/fasharif/topflow-hub-api:develop"
    )
    error_message = "The release step must run the migrate image with the release command."
  }

  assert {
    condition = contains(
      jsondecode(aws_ecs_task_definition.app["web"].container_definitions)[0].environment,
      { name = "NEXT_PUBLIC_SITE_URL", value = "https://staging.hub.example.com" },
    )
    error_message = "The web app must learn its public origin at runtime."
  }

  assert {
    condition     = aws_lb_listener.https.ssl_policy == "ELBSecurityPolicy-TLS13-1-2-2021-06" && aws_lb_listener.http.default_action[0].redirect[0].protocol == "HTTPS"
    error_message = "HTTPS must use the TLS 1.2/1.3 policy and HTTP must redirect to HTTPS."
  }

  assert {
    condition     = alltrue([for service in aws_ecs_service.app : service.deployment_circuit_breaker[0].rollback])
    error_message = "Failed deployments must roll back automatically."
  }

  assert {
    condition     = jsondecode(aws_iam_role.deploy.assume_role_policy).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:sub"] == "repo:fasharif/topflow:environment:aws-staging" && output.github_environment == "aws-staging"
    error_message = "Only the repository's aws-staging environment may assume the staging deploy role."
  }

  assert {
    condition = alltrue([
      for boundary in concat(
        [aws_iam_role.execution.permissions_boundary, aws_iam_role.deploy.permissions_boundary, aws_iam_role.flow_logs.permissions_boundary],
        [for role in aws_iam_role.task : role.permissions_boundary],
      ) : boundary == "arn:aws:iam::123456789012:policy/topflow-hub-workload-boundary"
    ]) && length(aws_iam_role.task) == 3
    error_message = "Every role of the environment must carry the workload boundary, or the apply role cannot create it."
  }

  assert {
    condition     = alltrue([for service in aws_ecs_service.app : service.desired_count == 0])
    error_message = "Services must start without tasks: the first release step runs before anything serves."
  }

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.app) == 9 && alltrue([for alarm in aws_cloudwatch_metric_alarm.app : alarm.alarm_actions == toset([aws_sns_topic.alarms.arn])])
    error_message = "Every alarm must notify the alarm topic."
  }

  assert {
    condition     = alltrue([for group in aws_cloudwatch_log_group.app : group.retention_in_days == 30 && group.kms_key_id == aws_kms_key.main.arn])
    error_message = "Application logs must be encrypted with the environment key and expire."
  }

  assert {
    condition     = length(aws_sns_topic_subscription.email) == 0 && aws_lb.main.enable_deletion_protection
    error_message = "Without alarm_email there is no subscription; deletion protection is on by default."
  }

  assert {
    condition     = output.secret_parameter_names == tolist(["/topflow-hub/staging/api/DATABASE_URL", "/topflow-hub/staging/api/DIRECT_URL", "/topflow-hub/staging/api/INTERNAL_API_SECRET", "/topflow-hub/staging/api/RESEND_API_KEY", "/topflow-hub/staging/api/SUPABASE_SECRET_KEY"])
    error_message = "The module must list the parameters an operator creates."
  }
}

run "production_with_sentry_and_alarm_email" {
  command = apply

  variables {
    environment   = "production"
    web_domain    = "hub.example.com"
    api_domain    = "api.hub.example.com"
    alarm_email   = "alerts@example.com"
    sentry_dsn    = "https://key@o1.ingest.sentry.io/1"
    api_min_count = 2
    api_max_count = 4
  }

  assert {
    condition = alltrue([
      for app in ["api", "web"] : contains(
        jsondecode(aws_ecs_task_definition.app[app].container_definitions)[0].environment,
        { name = "SENTRY_ENVIRONMENT", value = "production" },
      )
    ])
    error_message = "With sentry_dsn set, both applications report errors tagged with the environment."
  }

  assert {
    condition     = length(aws_sns_topic_subscription.email) == 1 && aws_sns_topic_subscription.email[0].endpoint == "alerts@example.com"
    error_message = "alarm_email must subscribe to the alarm topic."
  }

  assert {
    condition     = aws_appautoscaling_target.app["api"].min_capacity == 2 && aws_appautoscaling_target.app["api"].max_capacity == 4 && !aws_s3_bucket.alb_logs.force_destroy
    error_message = "Production scales the API between its limits and keeps its access logs."
  }
}

run "rejects_an_unknown_environment" {
  command = plan

  variables {
    environment = "dev"
  }

  expect_failures = [var.environment]
}

run "rejects_secrets_in_plain_settings" {
  command = plan

  variables {
    api_environment = { DATABASE_URL = "postgresql://user:password@host/db" }
  }

  expect_failures = [var.api_environment]
}

run "rejects_an_insecure_supabase_url" {
  command = plan

  variables {
    supabase_url = "http://abcdefghijklmnopqrst.supabase.co"
  }

  expect_failures = [var.supabase_url]
}
