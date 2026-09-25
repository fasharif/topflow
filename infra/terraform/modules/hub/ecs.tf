# ECS on Fargate: an API service, a web service, and the release-step task definition that the
# deploy workflow runs once per release, before either service changes.
#
# Terraform creates the first task definitions; the deploy workflow registers every later revision
# with the new image tag. The services therefore ignore task_definition changes, and Terraform never
# rolls a running release back to the image it was created with.

# Container Insights is a per-environment choice (production on, staging off to save its cost).
#trivy:ignore:AVD-AWS-0034
resource "aws_ecs_cluster" "main" {
  name = local.name

  setting {
    name  = "containerInsights"
    value = var.container_insights ? "enabled" : "disabled"
  }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
  }
}

locals {
  api_url = "https://${var.api_domain}"
  web_url = "https://${var.web_domain}"

  sentry = var.sentry_dsn == null ? {} : { SENTRY_DSN = var.sentry_dsn, SENTRY_ENVIRONMENT = var.environment }

  # Non-secret settings; secrets come from SSM through `secrets`.
  api_environment = merge(
    {
      NODE_ENV           = "production"
      PORT               = "3000"
      APP_PUBLIC_URL     = local.web_url
      SUPABASE_URL       = var.supabase_url
      STAFF_MFA_REQUIRED = "true"
      CORS_ORIGINS       = local.web_url
      TRUST_PROXY        = "true"
      MAIL_TRANSPORT     = "resend"
    },
    local.sentry,
    var.api_environment,
  )
  web_environment = merge(
    {
      API_INTERNAL_URL                     = local.api_url
      NEXT_PUBLIC_SITE_URL                 = local.web_url
      NEXT_PUBLIC_SUPABASE_URL             = var.supabase_url
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = var.supabase_publishable_key
    },
    local.sentry,
  )

  # Which secrets each container receives.
  container_secrets = {
    api     = ["api/DATABASE_URL", "api/SUPABASE_SECRET_KEY", "api/INTERNAL_API_SECRET", "api/RESEND_API_KEY"]
    migrate = ["api/DATABASE_URL", "api/DIRECT_URL", "api/SUPABASE_SECRET_KEY", "api/INTERNAL_API_SECRET", "api/RESEND_API_KEY"]
    web     = ["api/INTERNAL_API_SECRET"]
  }

  health_check_command = ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]

  containers = {
    api = {
      image       = local.images.api
      cpu         = var.api_cpu
      memory      = var.api_memory
      command     = ["serve"]
      environment = local.api_environment
      port        = true
      read_only   = true
    }
    web = {
      image       = local.images.web
      cpu         = var.web_cpu
      memory      = var.web_memory
      command     = null
      environment = local.web_environment
      port        = true
      # Next.js writes its fetch and image caches to .next/cache, the only directory the image lets
      # the `node` user change. A Fargate bind mount there would belong to root, so the root file
      # system stays writable and the image's file ownership does the restricting.
      read_only = false
    }
    migrate = {
      image       = local.images.migrate
      cpu         = 256
      memory      = 512
      command     = ["release"]
      environment = local.api_environment
      port        = false
      read_only   = true
    }
  }
}

resource "aws_ecs_task_definition" "app" {
  for_each = local.containers

  family                   = "${local.name}-${each.key}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = each.value.cpu
  memory                   = each.value.memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task[each.key].arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([{
    name                   = each.key
    image                  = each.value.image
    essential              = true
    command                = each.value.command
    user                   = "1000:1000"
    readonlyRootFilesystem = each.value.read_only
    linuxParameters        = { initProcessEnabled = true, capabilities = { drop = ["ALL"] } }
    portMappings           = each.value.port ? [{ containerPort = 3000, protocol = "tcp" }] : []
    environment            = [for key in sort(keys(each.value.environment)) : { name = key, value = each.value.environment[key] }]
    secrets = [for key in local.container_secrets[each.key] : {
      name      = element(split("/", key), 1)
      valueFrom = local.secret_arns[key]
    }]
    healthCheck = each.value.port ? {
      command     = local.health_check_command
      interval    = 15
      timeout     = 5
      retries     = 3
      startPeriod = 30
    } : null
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.app[each.key].name
        awslogs-region        = local.region
        awslogs-stream-prefix = each.key
      }
    }
  }])
}

resource "aws_ecs_service" "app" {
  for_each = { api = var.api_min_count, web = var.web_min_count }

  name                               = "${local.name}-${each.key}"
  cluster                            = aws_ecs_cluster.main.id
  task_definition                    = aws_ecs_task_definition.app[each.key].arn
  desired_count                      = each.value
  launch_type                        = "FARGATE"
  platform_version                   = "LATEST"
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  health_check_grace_period_seconds  = 60
  enable_execute_command             = false
  propagate_tags                     = "SERVICE"
  wait_for_steady_state              = false

  # A release whose tasks never become healthy is rolled back to the previous task definition.
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.tasks.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app[each.key].arn
    container_name   = each.key
    container_port   = 3000
  }

  lifecycle {
    # Releases belong to the deploy workflow, the task count to auto scaling.
    ignore_changes = [task_definition, desired_count]
  }

  depends_on = [aws_lb_listener_rule.app]
}

# CPU-based auto scaling between the minimum and maximum task counts.
resource "aws_appautoscaling_target" "app" {
  for_each = {
    api = { min = var.api_min_count, max = var.api_max_count }
    web = { min = var.web_min_count, max = var.web_max_count }
  }

  service_namespace  = "ecs"
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.app[each.key].name}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = each.value.min
  max_capacity       = max(each.value.min, each.value.max)
}

resource "aws_appautoscaling_policy" "cpu" {
  for_each = aws_appautoscaling_target.app

  name               = "${local.name}-${each.key}-cpu"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = each.value.service_namespace
  resource_id        = each.value.resource_id
  scalable_dimension = each.value.scalable_dimension

  target_tracking_scaling_policy_configuration {
    target_value       = 60
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}
