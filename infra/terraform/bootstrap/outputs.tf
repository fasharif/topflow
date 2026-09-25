output "state_bucket" {
  description = "Pass to the environments: terraform init -backend-config=\"bucket=<this>\". Also the TF_STATE_BUCKET repository variable."
  value       = aws_s3_bucket.state.bucket
}

output "github_oidc_provider_arn" {
  description = "GitHub Actions identity provider; the environments' deploy roles trust it."
  value       = aws_iam_openid_connect_provider.github.arn
}

output "terraform_plan_role_arn" {
  description = "AWS_TERRAFORM_PLAN_ROLE_ARN repository variable."
  value       = aws_iam_role.terraform_plan.arn
}

output "terraform_apply_role_arn" {
  description = "AWS_TERRAFORM_APPLY_ROLE_ARN repository variable."
  value       = aws_iam_role.terraform_apply.arn
}
