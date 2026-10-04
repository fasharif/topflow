variable "project" {
  description = "Name prefix of every resource."
  type        = string
  default     = "topflow-hub"
}

variable "region" {
  description = "Region of the state bucket (the environments use the same one)."
  type        = string
  default     = "ap-south-1"
}

variable "github_repository" {
  description = "GitHub repository (owner/name) whose workflows may plan and apply."
  type        = string
  default     = "fasharif/topflow"

  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repository))
    error_message = "github_repository must look like owner/name."
  }
}

variable "monthly_budget_usd" {
  description = "Monthly spending limit of the account, in US dollars. Alerts go out at 50%, 80% and 100% of actual spend and at 100% of the forecast. The default is the estimate for staging and production together (infra/scripts/cost-estimate.mts: 182.94 on 26 September 2026), rounded up."
  type        = number
  default     = 200

  validation {
    condition     = var.monthly_budget_usd > 0
    error_message = "monthly_budget_usd must be positive."
  }
}

variable "budget_emails" {
  description = "Addresses that receive the budget alerts."
  type        = list(string)

  validation {
    condition     = length(var.budget_emails) > 0 && alltrue([for address in var.budget_emails : can(regex("^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$", address))])
    error_message = "budget_emails needs at least one valid email address."
  }
}
