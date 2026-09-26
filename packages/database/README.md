# @topflow/database

Prisma 7 schema, migrations, seed data and the generated client for the Top Flow platform (PostgreSQL, `pg` driver adapter).

```ts
import { createPrismaClient, OrderStatus, Prisma } from '@topflow/database';

const prisma = createPrismaClient({ connectionString: process.env.DATABASE_URL! });
```

## Scripts

All commands read `DATABASE_URL` from the environment or `packages/database/.env`.

| Command | Purpose |
| --- | --- |
| `npm run build -w @topflow/database` | Generate the client and compile `dist/` |
| `npm run db:migrate -w @topflow/database` | Create and apply a migration in development |
| `npm run db:deploy -w @topflow/database` | Apply pending migrations (CI, production) |
| `npm run db:seed -w @topflow/database` | Load demo catalog, staff and a verified trade account (refuses to run in production) |
| `npm run db:studio -w @topflow/database` | Browse data with Prisma Studio |
| `npm run demo:reset -w @topflow/database -- --confirm` | Empty and reseed the public demo (needs `DEMO_MODE=true`; see below) |
| `npm run demo:rehearse -w @topflow/database` | Run the real demo reset against a throw-away database and a stand-in for Supabase Auth (see below) |
| `npm test -w @topflow/database` | Unit tests of the demo reset's safety checks |

## Resetting the public demo

`scripts/demo-reset.ts` returns the public portfolio demo to its seeded state every night ([ADR-021](../../docs/DECISIONS.md), [operations runbook](../../docs/OPERATIONS.md#10-public-demo)). It:

1. refuses to start unless `DEMO_MODE=true` and `--confirm` are given for the run (a `DEMO_MODE` found only in `.env` is refused, so a forgotten file value never empties a database), `NODE_ENV` is not `production` and no production seed setting is present, or when `SUPABASE_URL` and `DATABASE_URL` name different Supabase projects;
2. refuses any database that holds accounts the demo seed does not create but not the demo data set (the fictional Desert Bloom Landscaping LLC), and changes nothing. The seed creates Desert Bloom before any account, so a seed that stops part-way never locks the next reset out;
3. lists the Supabase Auth users of `SUPABASE_URL` (when `SUPABASE_URL` and `SUPABASE_SECRET_KEY` are set) and refuses, changing nothing, unless they are exactly the rows of the target database's own `auth.users` table: a key from another project, such as production, never gets as far as a deletion;
4. empties every table except `_prisma_migrations` in one `TRUNCATE … RESTART IDENTITY CASCADE` transaction;
5. deletes those Supabase Auth users, so changed passwords, enrolled authenticators and visitors' own accounts disappear;
6. runs `prisma/seed.ts` with the demo profile and the published password, which creates the demo accounts again.

The decisions live in `scripts/demo-reset-core.ts` and are unit-tested with in-memory fakes. The CI end-to-end job also runs the real script against PostgreSQL (without Supabase settings) before its tests, and runs `npm run demo:rehearse`. The rehearsal (`scripts/demo-reset-rehearsal.ts`) creates the database `topflow_demo_rehearsal` on the server in `DATABASE_URL`, adds an `auth.users` table and runs the real reset against it five times, with `SUPABASE_URL` pointing at `scripts/auth-standin.ts`, a stand-in for the Supabase Auth admin API backed by that table. In order: an empty database gets the 8 seeded accounts and their sign-ins; a second reset replaces every sign-in, including a visitor's own, and restores the published password; a key for another project is refused before anything changes; a simulated Auth outage at the second account stops the seed part-way; and the next reset recovers. It drops the database afterwards and refuses a hosted Supabase `DATABASE_URL`. The stand-in is a test double, so the Supabase steps have still not run against a real Supabase project.

## Migration workflow for data-changing releases

1. Change `prisma/schema.prisma`.
2. Generate SQL without applying it: `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script -o draft.sql`.
3. Move the SQL into a new folder under `prisma/migrations/` and add explicit data conversion before destructive steps (see `20260914090000_platform_v2`, which turns v1 contractors into organizations and v1 enquiries into RFQs inside one transaction).
4. Apply it to a database containing representative data and verify the result.
5. Confirm there is no drift: `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` must exit with `0`.
