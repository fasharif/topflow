output "load_balancer_dns_name" {
  description = "Point web_domain and api_domain at this name (CNAME or alias record)."
  value       = aws_lb.main.dns_name
}

output "load_balancer_zone_id" {
  description = "Hosted zone of the load balancer, for Route 53 alias records."
  value       = aws_lb.main.zone_id
}

output "cluster_name" {
  description = "ECS cluster of the environment."
  value       = aws_ecs_cluster.main.name
}

output "service_names" {
  description = "ECS services by application."
  value       = { for key, service in aws_ecs_service.app : key => service.name }
}

output "task_definition_families" {
  description = "Task definition families by application; the deploy workflow registers new revisions of these."
  value       = { for key, definition in aws_ecs_task_definition.app : key => definition.family }
}

output "deploy_role_arn" {
  description = "Set as the AWS_DEPLOY_ROLE_ARN variable of the GitHub environment named in github_environment."
  value       = aws_iam_role.deploy.arn
}

output "github_environment" {
  description = "GitHub environment (with required reviewers) whose Deploy jobs may assume the deploy role."
  value       = local.github_environment
}

output "secret_parameter_names" {
  description = "SecureString parameters to create with aws ssm put-parameter before the first release."
  value       = sort(values(local.secret_parameters))
}

output "release_parameter_names" {
  description = "SSM parameters holding the current and previous release tags."
  value       = { for key, parameter in aws_ssm_parameter.release : key => parameter.name }
}

output "alarm_topic_arn" {
  description = "SNS topic that receives every alarm."
  value       = aws_sns_topic.alarms.arn
}

output "kms_key_alias" {
  description = "KMS key for the environment's SecureString parameters."
  value       = aws_kms_alias.main.name
}
