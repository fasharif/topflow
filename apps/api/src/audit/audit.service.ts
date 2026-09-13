import { Global, Injectable, Module } from '@nestjs/common';
import type { Prisma } from '@topflow/database';
import { PrismaService } from '../prisma/prisma.service';
import type { AuditAction } from './audit-actions';

export interface AuditEntry {
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  userId?: string | null;
  organizationId?: string | null;
  ipAddress?: string | null;
  details?: Prisma.InputJsonValue;
}

/**
 * Append-only audit trail. Pass the transaction client when the audited change happens in
 * a transaction, so the log entry commits (or rolls back) together with the change.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    entry: AuditEntry,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await (tx ?? this.prisma).auditLog.create({
      data: {
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        userId: entry.userId ?? null,
        organizationId: entry.organizationId ?? null,
        ipAddress: entry.ipAddress ?? null,
        details: entry.details,
      },
    });
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
