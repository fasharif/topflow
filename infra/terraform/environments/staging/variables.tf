variable "region" {
  description = "AWS region. ap-south-1 (Mumbai) is the region of the Supabase project, so API-to-database round trips stay short (ADR-014)."
  type        = string
  default     = "ap-south-1"
}

variable "web_domain" {
  description = "Public host name of the web app."
  type        = string
}

variable "api_domain" {
  description = "Public host name of the API."
  type        = string
}

variable "certificate_arn" {
  description = "ACM certificate in var.region covering both host names."
  type        = string
}

variable "supabase_url" {
  description = "https URL of the Supabase project."
  type        = string
}

variable "supabase_publishable_key" {
  description = "Supabase publishable key (not a secret)."
  type        = string
}

variable "sentry_dsn" {
  description = "Sentry DSN for server errors, or null."
  type        = string
  default     = null
}

variable "alarm_email" {
  description = "Address that receives alarm notifications, or null."
  type        = string
  default     = null
}

variable "api_environment" {
  description = "Additional non-secret API settings, such as MAIL_FROM and COMPANY_*."
  type        = map(string)
  default     = {}
}
