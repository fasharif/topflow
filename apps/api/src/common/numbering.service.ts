import { Global, Injectable, Module } from '@nestjs/common';
import type { Prisma } from '@topflow/database';
import {
  formatDocumentNumber,
  sequenceKey,
  type DocumentType,
} from '@topflow/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Sequential document numbers (TF-SO-2026-000123). The counter is incremented with a
 * single atomic UPSERT; when called inside a transaction a rollback also rolls back the
 * increment, so numbers stay gap-free — as expected on UAE commercial documents.
 */
@Injectable()
export class NumberingService {
  constructor(private readonly prisma: PrismaService) {}

  async next(
    type: DocumentType,
    tx?: Prisma.TransactionClient,
    now: Date = new Date(),
  ): Promise<string> {
    const year = now.getUTCFullYear();
    const key = sequenceKey(type, year);
    const rows = await (tx ?? this.prisma).$queryRaw<Array<{ value: number }>>`
      INSERT INTO "document_sequences" ("key", "value", "updatedAt")
      VALUES (${key}, 1, NOW())
      ON CONFLICT ("key") DO UPDATE
        SET "value" = "document_sequences"."value" + 1, "updatedAt" = NOW()
      RETURNING "value"`;
    return formatDocumentNumber(type, year, Number(rows[0]?.value));
  }
}

@Global()
@Module({ providers: [NumberingService], exports: [NumberingService] })
export class NumberingModule {}
