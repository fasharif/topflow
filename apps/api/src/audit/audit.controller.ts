import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Prisma } from '@topflow/database';
import {
  Permission,
  auditLogQuerySchema,
  type AuditLogDto,
  type Paginated,
} from '@topflow/shared';
import { createZodDto } from 'nestjs-zod';
import { RequirePermissions } from '../common/decorators';
import { pageArgs, paginated } from '../common/serialization';
import { PrismaService } from '../prisma/prisma.service';

class AuditLogQueryDto extends createZodDto(auditLogQuerySchema) {}

@ApiTags('Admin · Audit trail')
@ApiBearerAuth()
@RequirePermissions(Permission.AUDIT_READ)
@Controller('admin/audit-logs')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(
    @Query() query: AuditLogQueryDto,
  ): Promise<Paginated<AuditLogDto>> {
    const where: Prisma.AuditLogWhereInput = {
      ...(query.entityType && { entityType: query.entityType }),
      ...(query.entityId && { entityId: query.entityId }),
      ...(query.userId && { userId: query.userId }),
      ...(query.action && { action: { startsWith: query.action } }),
    };
    const [logs, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        include: {
          user: { select: { id: true, fullName: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        ...pageArgs(query),
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return paginated(
      logs.map((log) => ({
        id: log.id,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        details: log.details,
        ipAddress: log.ipAddress,
        organizationId: log.organizationId,
        user: log.user,
        createdAt: log.createdAt.toISOString(),
      })),
      total,
      query,
    );
  }
}
