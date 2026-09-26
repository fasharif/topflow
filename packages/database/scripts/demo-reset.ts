/**
 * Nightly reset of the public portfolio demo (ADR-021, docs/OPERATIONS.md section 10):
 *
 *   DEMO_MODE=true npm run demo:reset -- --confirm
 *
 * Empties every application table of DATABASE_URL, removes the Supabase Auth users of the demo project
 * (SUPABASE_URL + SUPABASE_SECRET_KEY) and runs the demo seed again. It refuses to start without
 * DEMO_MODE=true and --confirm, refuses a database that holds accounts the demo seed does not create
 * but not the demo data, and refuses Supabase settings whose users are not exactly the database's own
 * auth.users. The safety checks live in demo-reset-core.ts.
 */
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';
import { DEMO_ORGANIZATION } from '@topflow/shared';
import {
  DEMO_SEED_EMAILS,
  DemoResetRefused,
  checkPreconditions,
  describeDatabase,
  resetDemo,
  type DemoDatabase,
  type IdentityDirectory,
  type ResetPlan,
} from './demo-reset-core';

const PACKAGE_ROOT = resolve(__dirname, '..');

function postgres(client: Client): DemoDatabase {
  return {
    async facts() {
      const tables = (
        await client.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename")
      ).rows.map((row) => row.tablename);
      // A Supabase project's database has its sign-ins in auth.users; plain PostgreSQL (CI) has none.
      const auth = await client.query<{ present: boolean }>("SELECT to_regclass('auth.users') IS NOT NULL AS present");
      const authUserIds = auth.rows[0]?.present
        ? (await client.query<{ id: string }>('SELECT id::text AS id FROM auth.users')).rows.map((row) => row.id)
        : null;
      if (!tables.includes('users') || !tables.includes('organizations')) {
        return { tables, users: 0, otherAccounts: 0, hasDemoOrganization: false, authUserIds };
      }
      const accounts = await client.query<{ users: string; other: string }>(
        'SELECT count(*)::text AS users, (count(*) FILTER (WHERE lower(email) <> ALL($1::text[])))::text AS other FROM public.users',
        [[...DEMO_SEED_EMAILS]],
      );
      const demo = await client.query('SELECT 1 FROM public.organizations WHERE trn = $1', [DEMO_ORGANIZATION.trn]);
      return {
        tables,
        users: Number(accounts.rows[0]?.users ?? 0),
        otherAccounts: Number(accounts.rows[0]?.other ?? 0),
        hasDemoOrganization: (demo.rowCount ?? 0) > 0,
        authUserIds,
      };
    },
    async truncate(statement) {
      await client.query('BEGIN');
      try {
        await client.query(statement);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    },
  };
}

function supabaseDirectory(supabase: NonNullable<ResetPlan['supabase']>): IdentityDirectory {
  const admin = createClient(supabase.url, supabase.secretKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  return {
    async listIds(page, perPage) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
      if (error) throw new Error(`Could not list Supabase Auth users: ${error.message}`);
      return data.users.map((user) => user.id);
    },
    async remove(id) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) throw new Error(`Could not delete Supabase Auth user ${id}: ${error.message}`);
    },
  };
}

/** Runs prisma/seed.ts exactly as `npm run db:seed` does, with the demo environment. */
function runSeed(env: NodeJS.ProcessEnv): Promise<void> {
  const result = spawnSync(process.execPath, [require.resolve('tsx/cli'), 'prisma/seed.ts'], {
    cwd: PACKAGE_ROOT,
    env,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    return Promise.reject(
      new Error(
        `The demo seed failed (exit code ${result.status ?? 'none'}). The demo is incomplete until a reset succeeds: fix the cause and run the reset again.`,
      ),
    );
  }
  return Promise.resolve();
}

async function main(): Promise<void> {
  const checked = checkPreconditions(process.env, process.argv.slice(2));
  if (!checked.ok) {
    console.error(`Demo reset refused:\n${checked.problems.map((problem) => `  - ${problem}`).join('\n')}`);
    process.exitCode = 1;
    return;
  }

  const { plan } = checked;
  console.log(`Resetting the demo database at ${describeDatabase(plan.databaseUrl)}.`);
  const client = new Client({ connectionString: plan.databaseUrl });
  await client.connect();
  try {
    const summary = await resetDemo(process.env, {
      database: postgres(client),
      identities: plan.supabase ? supabaseDirectory(plan.supabase) : null,
      seed: runSeed,
      log: (message) => console.log(message),
    });
    console.log(
      `Demo reset complete: ${summary.tables} tables emptied, ${summary.identitiesRemoved} sign-in(s) removed and the demo data set loaded again.`,
    );
  } catch (error) {
    if (error instanceof DemoResetRefused) {
      console.error(`Demo reset refused: ${error.message}`);
    } else {
      console.error(error);
    }
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

void main();
