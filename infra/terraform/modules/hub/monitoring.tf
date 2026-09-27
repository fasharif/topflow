# Logs and alarms. Every alarm notifies one SNS topic; alarm_email subscribes an address to it.

resource "aws_cloudwatch_log_group" "app" {
  for_each = toset(["api", "web", "migrate"])

  name              = "/${var.project}/${var.environment}/${each.key}"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.main.arn
}

resource "aws_cloudwatch_log_group" "flow_logs" {
  name              = "/${var.project}/${var.environment}/vpc-flow-logs"
  retention_in_days = 14
  kms_key_id        = aws_kms_key.main.arn
}

resource "aws_sns_topic" "alarms" {
  name              = "${local.name}-alarms"
  kms_master_key_id = aws_kms_key.main.arn
}

resource "aws_sns_topic_subscription" "email" {
  # Whether an address is set is not itself sensitive; count cannot use a sensitive value.
  count = nonsensitive(var.alarm_email != null) ? 1 : 0

  topic_arn = aws_sns_topic.alarms.arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

# Server errors the API logs: NestJS writes an ERROR line with the request id for each one.
resource "aws_cloudwatch_log_metric_filter" "api_errors" {
  name           = "${local.name}-api-errors"
  log_group_name = aws_cloudwatch_log_group.app["api"].name
  pattern        = "\"ERROR\""

  metric_transformation {
    name          = "ApiErrorLogs"
    namespace     = "TopFlowHub/${var.environment}"
    value         = "1"
    default_value = "0"
  }
}

locals {
  alb_dimension = { LoadBalancer = aws_lb.main.arn_suffix }

  alarms = {
    alb-5xx = {
      description = "The load balancer answered 5xx (no healthy target, or a timeout) more than 5 times in 5 minutes."
      namespace   = "AWS/ApplicationELB"
      metric      = "HTTPCode_ELB_5XX_Count"
      statistic   = "Sum"
      dimensions  = local.alb_dimension
      threshold   = 5
      periods     = 1
    }
    api-5xx = {
      description = "The API returned more than 10 server errors in 5 minutes."
      namespace   = "AWS/ApplicationELB"
      metric      = "HTTPCode_Target_5XX_Count"
      statistic   = "Sum"
      dimensions  = merge(local.alb_dimension, { TargetGroup = aws_lb_target_group.app["api"].arn_suffix })
      threshold   = 10
      periods     = 1
    }
    api-latency = {
      description = "API responses have averaged over 2 seconds for 15 minutes."
      namespace   = "AWS/ApplicationELB"
      metric      = "TargetResponseTime"
      statistic   = "Average"
      dimensions  = merge(local.alb_dimension, { TargetGroup = aws_lb_target_group.app["api"].arn_suffix })
      threshold   = 2
      periods     = 3
    }
    api-unhealthy = {
      description = "An API task has failed its health check for 10 minutes."
      namespace   = "AWS/ApplicationELB"
      metric      = "UnHealthyHostCount"
      statistic   = "Maximum"
      dimensions  = merge(local.alb_dimension, { TargetGroup = aws_lb_target_group.app["api"].arn_suffix })
      threshold   = 0
      periods     = 2
    }
    web-unhealthy = {
      description = "A web task has failed its health check for 10 minutes."
      namespace   = "AWS/ApplicationELB"
      metric      = "UnHealthyHostCount"
      statistic   = "Maximum"
      dimensions  = merge(local.alb_dimension, { TargetGroup = aws_lb_target_group.app["web"].arn_suffix })
      threshold   = 0
      periods     = 2
    }
    api-cpu = {
      description = "API tasks have used over 85% CPU for 15 minutes, even with auto scaling."
      namespace   = "AWS/ECS"
      metric      = "CPUUtilization"
      statistic   = "Average"
      dimensions  = { ClusterName = aws_ecs_cluster.main.name, ServiceName = aws_ecs_service.app["api"].name }
      threshold   = 85
      periods     = 3
    }
    api-memory = {
      description = "API tasks have used over 85% of their memory for 15 minutes."
      namespace   = "AWS/ECS"
      metric      = "MemoryUtilization"
      statistic   = "Average"
      dimensions  = { ClusterName = aws_ecs_cluster.main.name, ServiceName = aws_ecs_service.app["api"].name }
      threshold   = 85
      periods     = 3
    }
    web-memory = {
      description = "Web tasks have used over 85% of their memory for 15 minutes."
      namespace   = "AWS/ECS"
      metric      = "MemoryUtilization"
      statistic   = "Average"
      dimensions  = { ClusterName = aws_ecs_cluster.main.name, ServiceName = aws_ecs_service.app["web"].name }
      threshold   = 85
      periods     = 3
    }
    api-error-logs = {
      description = "The API logged more than 20 errors in 5 minutes."
      namespace   = "TopFlowHub/${var.environment}"
      metric      = "ApiErrorLogs"
      statistic   = "Sum"
      dimensions  = {}
      threshold   = 20
      periods     = 1
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "app" {
  for_each = local.alarms

  alarm_name          = "${local.name}-${each.key}"
  alarm_description   = each.value.description
  namespace           = each.value.namespace
  metric_name         = each.value.metric
  statistic           = each.value.statistic
  dimensions          = each.value.dimensions
  period              = 300
  evaluation_periods  = each.value.periods
  threshold           = each.value.threshold
  comparison_operator = "GreaterThanThreshold"
  # No requests means no errors, not an outage (the uptime workflow watches availability).
  treat_missing_data = "notBreaching"
  alarm_actions      = [aws_sns_topic.alarms.arn]
  ok_actions         = [aws_sns_topic.alarms.arn]

  depends_on = [aws_cloudwatch_log_metric_filter.api_errors]
}
