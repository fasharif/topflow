# Application Load Balancer: HTTPS only (HTTP redirects), host-based routing to the web app and the
# API, access logs in S3.

# Internet-facing by design: it is the public entry point of the web app and the API.
#trivy:ignore:AVD-AWS-0053
resource "aws_lb" "main" {
  name                       = local.name
  load_balancer_type         = "application"
  internal                   = false
  ip_address_type            = "dualstack"
  subnets                    = aws_subnet.public[*].id
  security_groups            = [aws_security_group.alb.id]
  drop_invalid_header_fields = true
  enable_deletion_protection = var.alb_deletion_protection
  idle_timeout               = 60

  access_logs {
    bucket  = aws_s3_bucket.alb_logs.id
    prefix  = "alb"
    enabled = true
  }

  depends_on = [aws_s3_bucket_policy.alb_logs]
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn

  # Requests for any other host name get a plain 404.
  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Not found"
      status_code  = "404"
    }
  }
}

resource "aws_lb_target_group" "app" {
  for_each = { api = var.api_domain, web = var.web_domain }

  name                 = "${local.name}-${each.key}"
  port                 = 3000
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = aws_vpc.main.id
  deregistration_delay = 30

  # Liveness only: a database outage must not make the load balancer drain every API task.
  # Readiness (/health/ready) is watched by the uptime workflow and the deploy smoke test.
  health_check {
    path                = "/health"
    matcher             = "200"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

resource "aws_lb_listener_rule" "app" {
  for_each = { api = var.api_domain, web = var.web_domain }

  listener_arn = aws_lb_listener.https.arn
  priority     = each.key == "api" ? 10 : 20

  condition {
    host_header {
      values = [each.value]
    }
  }

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app[each.key].arn
  }
}

# Access logs. Logging the access-log bucket itself would recurse.
#trivy:ignore:AVD-AWS-0089
resource "aws_s3_bucket" "alb_logs" {
  bucket        = "${local.name}-alb-logs-${local.account_id}"
  force_destroy = var.environment != "production"
}

resource "aws_s3_bucket_public_access_block" "alb_logs" {
  bucket                  = aws_s3_bucket.alb_logs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# Load balancers deliver access logs only to buckets encrypted with SSE-S3, not SSE-KMS.
#trivy:ignore:AVD-AWS-0132
resource "aws_s3_bucket_server_side_encryption_configuration" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id

  rule {
    id     = "expire"
    status = "Enabled"
    filter {}
    expiration {
      days = 90
    }
    noncurrent_version_expiration {
      noncurrent_days = 7
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

data "aws_elb_service_account" "current" {}

resource "aws_s3_bucket_policy" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "LoadBalancerLogDelivery"
        Effect    = "Allow"
        Principal = { AWS = data.aws_elb_service_account.current.arn }
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.alb_logs.arn}/alb/AWSLogs/${local.account_id}/*"
      },
      {
        Sid       = "TlsOnly"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [aws_s3_bucket.alb_logs.arn, "${aws_s3_bucket.alb_logs.arn}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
    ]
  })

  depends_on = [aws_s3_bucket_public_access_block.alb_logs]
}
