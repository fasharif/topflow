output "load_balancer_dns_name" {
  description = "Point the web and API host names at this name."
  value       = module.hub.load_balancer_dns_name
}

output "deploy_role_arn" {
  description = "AWS_DEPLOY_ROLE_ARN variable of the matching GitHub environment."
  value       = module.hub.deploy_role_arn
}

output "secret_parameter_names" {
  description = "SecureString parameters to create before the first release."
  value       = module.hub.secret_parameter_names
}

output "cluster_name" {
  description = "ECS cluster."
  value       = module.hub.cluster_name
}

output "service_names" {
  description = "ECS services."
  value       = module.hub.service_names
}

output "kms_key_alias" {
  description = "KMS key for the SecureString parameters."
  value       = module.hub.kms_key_alias
}
