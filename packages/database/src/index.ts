import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

export * from '../generated/prisma/client';

export interface CreatePrismaClientOptions {
  connectionString: string;
  /** Maximum pooled connections (defaults to the pg default of 10). */
  poolMax?: number;
  log?: Array<'query' | 'info' | 'warn' | 'error'>;
}

/**
 * Builds a PrismaClient wired to the node-postgres driver adapter (Prisma 7 has no
 * bundled query engine). Shared by the API, the seed script and integration tests.
 */
export function createPrismaClient(options: CreatePrismaClientOptions): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: options.connectionString,
    max: options.poolMax,
  });
  return new PrismaClient({ adapter, log: options.log });
}
