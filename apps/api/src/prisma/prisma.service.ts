import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@topflow/database';
import { attachDatabasePool } from '@vercel/functions';
import { Pool } from 'pg';
import { InjectConfig } from '../config/config.module';
import type { AppConfig } from '../config/env';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly pool: Pool;

  constructor(@InjectConfig() config: AppConfig) {
    // Short idle timeouts suit serverless instances and Supabase's connection pooler.
    const pool = new Pool({
      connectionString: config.database.url,
      max: config.database.poolMax,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });
    super({ adapter: new PrismaPg(pool) });
    this.pool = pool;
    // On Vercel Fluid compute, release idle connections before an instance is suspended.
    if (process.env.VERCEL) attachDatabasePool(pool);
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    if (!this.pool.ended) await this.pool.end();
  }
}
