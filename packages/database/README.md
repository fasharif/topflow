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

## Migration workflow for data-changing releases

1. Change `prisma/schema.prisma`.
2. Generate SQL without applying it: `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script -o draft.sql`.
3. Move the SQL into a new folder under `prisma/migrations/` and add explicit data conversion before destructive steps (see `20260914090000_platform_v2`, which turns v1 contractors into organizations and v1 enquiries into RFQs inside one transaction).
4. Apply it to a database containing representative data and verify the result.
5. Confirm there is no drift: `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` must exit with `0`.
