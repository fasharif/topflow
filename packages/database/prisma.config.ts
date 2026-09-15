import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// `prisma generate` must work without a database (CI, Docker build stage), so the
// URL is read leniently here; commands that need a connection will fail loudly.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
