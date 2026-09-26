# Network: one VPC with a public subnet in each of two availability zones.
#
# Tasks run in the public subnets with public IP addresses and reach Supabase, the image registry,
# Sentry and the email provider directly. That avoids NAT gateways, which would cost more than the
# rest of the environment; inbound traffic is still limited to the load balancer by security groups.

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = local.name }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = { Name = local.name }
}

resource "aws_subnet" "public" {
  count = length(local.azs)

  vpc_id            = aws_vpc.main.id
  availability_zone = local.azs[count.index]
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index)
  # Tasks get their public addresses from the ECS service (assign_public_ip), not from the subnet.
  map_public_ip_on_launch = false

  tags = { Name = "${local.name}-public-${local.azs[count.index]}" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = { Name = "${local.name}-public" }
}

resource "aws_route_table_association" "public" {
  count = length(aws_subnet.public)

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# The default security group allows nothing, so nothing can be attached to it by accident.
resource "aws_default_security_group" "main" {
  vpc_id = aws_vpc.main.id
}

# Rejected connections are recorded for investigations; accepted traffic is left out to keep the
# log volume (and cost) small.
resource "aws_flow_log" "rejected" {
  vpc_id                   = aws_vpc.main.id
  traffic_type             = "REJECT"
  log_destination_type     = "cloud-watch-logs"
  log_destination          = aws_cloudwatch_log_group.flow_logs.arn
  iam_role_arn             = aws_iam_role.flow_logs.arn
  max_aggregation_interval = 600
}

resource "aws_iam_role" "flow_logs" {
  name                 = "${local.name}-flow-logs"
  permissions_boundary = local.permissions_boundary
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "vpc-flow-logs.amazonaws.com" }
      Action    = "sts:AssumeRole"
      Condition = { StringEquals = { "aws:SourceAccount" = local.account_id } }
    }]
  })
}

resource "aws_iam_role_policy" "flow_logs" {
  name = "write-flow-logs"
  role = aws_iam_role.flow_logs.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogStreams"]
      Resource = "${aws_cloudwatch_log_group.flow_logs.arn}:*"
    }]
  })
}

resource "aws_security_group" "alb" {
  name        = "${local.name}-alb"
  description = "Public HTTPS entry point"
  vpc_id      = aws_vpc.main.id

  tags = { Name = "${local.name}-alb" }
}

# The load balancer is the public entry point, so it accepts HTTPS (and HTTP, which it redirects)
# from anywhere.
resource "aws_vpc_security_group_ingress_rule" "alb" {
  for_each = { https = 443, http = 80 }

  security_group_id = aws_security_group.alb.id
  description       = "Public ${each.value == 443 ? "HTTPS" : "HTTP (redirected to HTTPS)"}"
  ip_protocol       = "tcp"
  from_port         = each.value
  to_port           = each.value
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_egress_rule" "alb_to_tasks" {
  security_group_id            = aws_security_group.alb.id
  description                  = "Forward requests to the tasks"
  ip_protocol                  = "tcp"
  from_port                    = 3000
  to_port                      = 3000
  referenced_security_group_id = aws_security_group.tasks.id
}

resource "aws_security_group" "tasks" {
  name        = "${local.name}-tasks"
  description = "API, web and release tasks: inbound only from the load balancer"
  vpc_id      = aws_vpc.main.id

  tags = { Name = "${local.name}-tasks" }
}

resource "aws_vpc_security_group_ingress_rule" "tasks_from_alb" {
  security_group_id            = aws_security_group.tasks.id
  description                  = "Requests from the load balancer"
  ip_protocol                  = "tcp"
  from_port                    = 3000
  to_port                      = 3000
  referenced_security_group_id = aws_security_group.alb.id
}

# Outbound: HTTPS (Supabase Auth, GHCR, Sentry, Resend) and PostgreSQL on Supabase's pooler ports
# (5432 session, 6543 transaction). Supabase does not publish fixed addresses, so the destination
# cannot be narrowed further than the ports.
#trivy:ignore:AVD-AWS-0104
resource "aws_vpc_security_group_egress_rule" "tasks" {
  for_each = { https = 443, postgres_session = 5432, postgres_transaction = 6543 }

  security_group_id = aws_security_group.tasks.id
  description       = "Outbound ${each.key}"
  ip_protocol       = "tcp"
  from_port         = each.value
  to_port           = each.value
  cidr_ipv4         = "0.0.0.0/0"
}
