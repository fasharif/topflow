# Unit tests of the account bootstrap with a mocked AWS provider (no credentials, nothing created).

mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = { account_id = "123456789012" }
  }
  mock_resource "aws_s3_bucket" {
    defaults = { arn = "arn:aws:s3:::topflow-hub-tfstate-123456789012" }
  }
  mock_resource "aws_iam_openid_connect_provider" {
    defaults = { arn = "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::123456789012:role/mock" }
  }
}

variables {
  budget_emails = ["alerts@example.com"]
}

run "account_foundation" {
  command = apply

  assert {
    condition     = aws_s3_bucket.state.bucket == "topflow-hub-tfstate-123456789012" && aws_s3_bucket_versioning.state.versioning_configuration[0].status == "Enabled"
    error_message = "The state bucket is named after the account and keeps old state versions."
  }

  assert {
    condition = alltrue([
      aws_s3_bucket_public_access_block.state.block_public_acls,
      aws_s3_bucket_public_access_block.state.block_public_policy,
      aws_s3_bucket_public_access_block.state.ignore_public_acls,
      aws_s3_bucket_public_access_block.state.restrict_public_buckets,
    ])
    error_message = "The state bucket must never be public."
  }

  assert {
    condition = jsondecode(aws_iam_role.terraform_plan.assume_role_policy).Statement[0].Condition.StringLike["token.actions.githubusercontent.com:sub"] == [
      "repo:fasharif/topflow:pull_request",
      "repo:fasharif/topflow:ref:refs/heads/develop",
    ]
    error_message = "Plans may run for pull requests and the develop branch only."
  }

  assert {
    condition = jsondecode(aws_iam_role.terraform_apply.assume_role_policy).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:sub"] == [
      "repo:fasharif/topflow:environment:staging",
      "repo:fasharif/topflow:environment:production",
    ]
    error_message = "Applies may run only from the approved staging and production environments."
  }

  assert {
    condition     = jsondecode(aws_iam_role_policy.terraform_apply_iam.policy).Statement[0].Resource == "arn:aws:iam::123456789012:role/topflow-hub-*"
    error_message = "The apply role may only manage this project's IAM roles."
  }

  assert {
    condition     = aws_budgets_budget.monthly.limit_amount == "60.00" && length(aws_budgets_budget.monthly.notification) == 4
    error_message = "The budget alerts at 50, 80 and 100 percent of actual spend and on the forecast."
  }
}

run "rejects_a_budget_without_recipients" {
  command = plan

  variables {
    budget_emails = []
  }

  expect_failures = [var.budget_emails]
}

run "rejects_a_malformed_address" {
  command = plan

  variables {
    budget_emails = ["not an address"]
  }

  expect_failures = [var.budget_emails]
}
