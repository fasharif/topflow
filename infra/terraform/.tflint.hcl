# tflint configuration for every Terraform root and module under infra/terraform.
#   docker run --rm -v "$PWD:/data" -w /data ghcr.io/terraform-linters/tflint:v0.64.0 --init
#   docker run --rm -v "$PWD:/data" -w /data ghcr.io/terraform-linters/tflint:v0.64.0 --recursive
config {
  call_module_type = "local"
}

plugin "terraform" {
  enabled = true
  preset  = "all"
}

plugin "aws" {
  enabled = true
  version = "0.49.0"
  source  = "github.com/terraform-linters/tflint-ruleset-aws"
}
