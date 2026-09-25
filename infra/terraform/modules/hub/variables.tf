variable "project" {
  description = "Name prefix of every resource."
  type        = string
  default     = "topflow-hub"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,20}$", var.project))
    error_message = "project must be 3-21 lower-case letters, digits or dashes, starting with a letter."
  }
}

variable "environment" {
  description = "Deployment environment."
  type        = string

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be \"staging\" or \"production\"."
  }
}

variable "github_repository" {
  description = "GitHub repository (owner/name) whose deploy workflow may assume the deploy role."
  type        = string
  default     = "fasharif/topflow"

  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repository))
    error_message = "github_repository must look like owner/name."
  }
}

variable "image_registry" {
  description = "Registry and namespace of the images built by .github/workflows/containers.yml (public GHCR packages)."
  type        = string
  default     = "ghcr.io/fasharif"
}

variable "image_tag" {
  description = "Image tag of the initial task definitions. Later releases are registered by the deploy workflow, which Terraform leaves alone."
  type        = string
  default     = "develop"
}

variable "vpc_cidr" {
  description = "Address range of the environment's VPC."
  type        = string
  default     = "10.40.0.0/16"

  validation {
    condition     = can(cidrnetmask(var.vpc_cidr))
    error_message = "vpc_cidr must be an IPv4 CIDR block."
  }
}

variable "web_domain" {
  description = "Public host name of the web app, for example hub.example.com."
  type        = string
}

variable "api_domain" {
  description = "Public host name of the API, for example api.hub.example.com."
  type        = string
}

variable "certificate_arn" {
  description = "ACM certificate (in this region) covering web_domain and api_domain. DNS validation happens outside Terraform."
  type        = string

  validation {
    condition     = can(regex("^arn:aws:acm:[a-z0-9-]+:[0-9]{12}:certificate/.+$", var.certificate_arn))
    error_message = "certificate_arn must be the ARN of an ACM certificate."
  }
}

variable "supabase_url" {
  description = "https URL of the Supabase project (data and identity stay on Supabase, ADR-014)."
  type        = string

  validation {
    condition     = can(regex("^https://", var.supabase_url))
    error_message = "supabase_url must be an https URL."
  }
}

variable "supabase_publishable_key" {
  description = "Supabase publishable key (sb_publishable_...). Not a secret; the web server uses it."
  type        = string
}

variable "api_environment" {
  description = "Additional non-secret API settings (MAIL_FROM, COMPANY_*, THROTTLE_*). Secrets belong in SSM (secrets.tf)."
  type        = map(string)
  default     = {}

  validation {
    condition     = length(setintersection(keys(var.api_environment), ["DATABASE_URL", "DIRECT_URL", "SUPABASE_SECRET_KEY", "INTERNAL_API_SECRET", "RESEND_API_KEY"])) == 0
    error_message = "Secrets cannot be passed in api_environment: set them as SSM parameters."
  }
}

variable "sentry_dsn" {
  description = "Sentry DSN for server errors of the API and the web app (not a secret: DSNs only allow sending events). Null turns reporting off."
  type        = string
  default     = null

  validation {
    condition     = var.sentry_dsn == null || can(regex("^https://", var.sentry_dsn))
    error_message = "sentry_dsn must be an https URL, or null."
  }
}

variable "api_cpu" {
  description = "CPU units of an API task (1024 = one vCPU)."
  type        = number
  default     = 512
}

variable "api_memory" {
  description = "Memory of an API task, in MiB."
  type        = number
  default     = 1024
}

variable "web_cpu" {
  description = "CPU units of a web task."
  type        = number
  default     = 512
}

variable "web_memory" {
  description = "Memory of a web task, in MiB."
  type        = number
  default     = 1024
}

variable "api_min_count" {
  description = "Minimum number of API tasks (also the initial count)."
  type        = number
  default     = 1

  validation {
    condition     = var.api_min_count >= 1
    error_message = "api_min_count must be at least 1."
  }
}

variable "api_max_count" {
  description = "Maximum number of API tasks under load."
  type        = number
  default     = 2
}

variable "web_min_count" {
  description = "Minimum number of web tasks (also the initial count)."
  type        = number
  default     = 1

  validation {
    condition     = var.web_min_count >= 1
    error_message = "web_min_count must be at least 1."
  }
}

variable "web_max_count" {
  description = "Maximum number of web tasks under load."
  type        = number
  default     = 2
}

variable "log_retention_days" {
  description = "Retention of application logs, in days."
  type        = number
  default     = 30

  validation {
    condition     = contains([1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288, 3653], var.log_retention_days)
    error_message = "log_retention_days must be a retention period CloudWatch Logs supports."
  }
}

variable "alarm_email" {
  description = "Email address that receives alarm notifications (confirm the subscription email). Null for none."
  type        = string
  default     = null
}

variable "container_insights" {
  description = "Enable CloudWatch Container Insights on the cluster (adds per-task metrics, at a cost)."
  type        = bool
  default     = false
}

variable "alb_deletion_protection" {
  description = "Protect the load balancer from deletion."
  type        = bool
  default     = true
}
