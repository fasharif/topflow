terraform {
  # 1.10 brings S3-native state locking (use_lockfile), used by the environments.
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.66"
    }
  }
}
