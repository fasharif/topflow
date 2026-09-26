# The production environment. Plan and apply from this directory; see infra/README.md.

terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.66"
    }
  }

  # Partial configuration: pass the bucket from the bootstrap output with
  #   terraform init -backend-config="bucket=<state bucket>"
  # so no account-specific name is committed. use_lockfile locks the state with an S3 object.
  backend "s3" {
    key          = "topflow-hub/production.tfstate"
    region       = "ap-south-1"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = "topflow-hub"
      Environment = "production"
      ManagedBy   = "terraform"
      Repository  = "fasharif/topflow"
    }
  }
}

module "hub" {
  source = "../../modules/hub"

  environment              = "production"
  web_domain               = var.web_domain
  api_domain               = var.api_domain
  certificate_arn          = var.certificate_arn
  supabase_url             = var.supabase_url
  supabase_publishable_key = var.supabase_publishable_key
  sentry_dsn               = var.sentry_dsn
  alarm_email              = var.alarm_email
  api_environment          = var.api_environment

  api_cpu                 = 512
  api_memory              = 1024
  web_cpu                 = 512
  web_memory              = 1024
  api_min_count           = 2
  api_max_count           = 4
  web_min_count           = 2
  web_max_count           = 4
  log_retention_days      = 90
  alb_deletion_protection = true
  container_insights      = true
}
