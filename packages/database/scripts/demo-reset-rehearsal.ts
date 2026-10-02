/**
 * Rehearses the hosted demo's nightly reset, Supabase steps included, without a Supabase project:
 *
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres npm run demo:rehearse -w @topflow/database
 *
 * It creates a throw-away database, `topflow_demo_rehearsal`, on the PostgreSQL server of DATABASE_URL
 * (dropping any earlier one of that name), applies the migrations and adds an `auth.users` table like a
 * Supabase project's. It then runs the real `npm run demo:reset -- --confirm` (scripts/demo-reset.ts)
 * against it, with SUPABASE_URL pointing at a stand-in for the Supabase Auth admin API backed by that
 * table (scripts/auth-standin.ts), through the five scenarios below, and drops the database at the end.
 * CI runs it in the end-to-end job. It never touches the database named in DATABASE_URL itself.
 */
import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { DEMO_ACCOUNT_PASSWORD, DEMO_ORGANIZATION } from '@topflow/shared';
import { Client, Pool } from 'pg';
import { AUTH_USERS_COLUMNS, hashPassword, passwordMatches, startAuthStandIn, type AuthStandIn } from './auth-standin';
import { DEMO_SEED_EMAILS, supabaseProjectOf } from './demo-reset-core';

const PACKAGE_ROOT = resolve(__dirname, '..');
const DATABASE_NAME = 'topflow_demo_rehearsal';
const SEEDED_ACCOUNTS = DEMO_SEED_EMAILS.length;
const ADMIN = 'admin@topflow.example';
/** The account the simulated Supabase Auth outage hits: the second one the demo seed creates. */
const OUTAGE_ACCOUNT = 'sales@topflow.example';

class RehearsalFailed extends Error {}

function expectThat(condition: boolean, description: string, output = ''): void {
  if (condition) return;
  const tail = output.trim().split('\n').slice(-15).join('\n');
  throw new RehearsalFailed(tail ? `${description}\n--- last lines of the reset's output ---\n${tail}` : description);
}

interface ResetRun {
  code: number | null;
  output: string;
}

/** Runs `npm run demo:reset -- --confirm` as the nightly workflow does. Asynchronous, so the stand-ins keep answering. */
function runReset(databaseUrl: string, supabaseUrl: string): Promise<ResetRun> {
  return new Promise((done, failed) => {
    const child = spawn(process.execPath, [require.resolve('tsx/cli'), 'scripts/demo-reset.ts', '--confirm'], {
      cwd: PACKAGE_ROOT,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        DIRECT_URL: databaseUrl,
        SUPABASE_URL: supabaseUrl,
        SUPABASE_SECRET_KEY: 'sb_secret_rehearsal_stand_in_key',
        SEED_IDENTITIES: 'true',
        DEMO_MODE: 'true',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.on('error', failed);
    child.on('close', (code) => done({ code, output }));
  });
}

interface DemoState {
  /** Ids in public.users. */
  accounts: string[];
  /** Ids in auth.users. */
  signIns: string[];
  hasDemoOrganization: boolean;
  /** The stand-in's digest of the administrator's password, if the sign-in exists. */
  adminPassword: string | null;
}

async function readState(pool: Pool): Promise<DemoState> {
  const ids = async (sql: string) => (await pool.query<{ id: string }>(sql)).rows.map((row) => row.id);
  const admin = await pool.query<{ encrypted_password: string | null }>('SELECT encrypted_password FROM auth.users WHERE email = $1', [ADMIN]);
  const organization = await pool.query('SELECT 1 FROM public.organizations WHERE trn = $1', [DEMO_ORGANIZATION.trn]);
  return {
    accounts: await ids('SELECT id::text AS id FROM public.users ORDER BY id'),
    signIns: await ids('SELECT id::text AS id FROM auth.users ORDER BY id'),
    hasDemoOrganization: (organization.rowCount ?? 0) > 0,
    adminPassword: admin.rows[0]?.encrypted_password ?? null,
  };
}

const sameIds = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id, i) => id === b[i]);
const requestsSince = (standIn: AuthStandIn, mark: number, method: string) =>
  standIn.requests.slice(mark).filter((request) => request.startsWith(`${method} `)).length;

/** The demo data set as a successful reset leaves it: every seeded account signs in with the published password. */
function expectFreshDemo(state: DemoState, output: string): void {
  expectThat(state.accounts.length === SEEDED_ACCOUNTS, `expected ${SEEDED_ACCOUNTS} accounts, found ${state.accounts.length}`, output);
  expectThat(sameIds(state.accounts, state.signIns), 'every account must have a sign-in with the same id, and no other sign-in may exist', output);
  expectThat(state.hasDemoOrganization, `${DEMO_ORGANIZATION.name} is missing`, output);
  expectThat(passwordMatches(DEMO_ACCOUNT_PASSWORD, state.adminPassword), `${ADMIN} does not have the published password`, output);
}

async function rehearse(pool: Pool, databaseUrl: string, own: AuthStandIn, other: AuthStandIn): Promise<string[]> {
  const passed: string[] = [];
  const scenario = async (name: string, body: () => Promise<void>) => {
    await body();
    passed.push(name);
    console.log(`  passed: ${name}`);
  };

  await scenario(`an empty demo database gets the ${SEEDED_ACCOUNTS} seeded accounts and their sign-ins`, async () => {
    const run = await runReset(databaseUrl, own.url);
    expectThat(run.code === 0, `the reset exited with ${run.code}`, run.output);
    expectFreshDemo(await readState(pool), run.output);
  });

  await scenario("a second reset replaces every sign-in, including a visitor's own, and restores the published password", async () => {
    // What a day of visitors leaves behind: a changed shared password and a visitor's own account.
    await pool.query('UPDATE auth.users SET encrypted_password = $1 WHERE email = $2', [hashPassword('changed-by-a-visitor'), ADMIN]);
    const visitor = await pool.query<{ id: string }>("INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'visitor@example.org') RETURNING id::text AS id");
    await pool.query(`INSERT INTO public.users (id, email, "fullName", "updatedAt") VALUES ($1, 'visitor@example.org', 'Demo Visitor', now())`, [visitor.rows[0]?.id]);
    const before = await readState(pool);
    const mark = own.requests.length;

    const run = await runReset(databaseUrl, own.url);
    expectThat(run.code === 0, `the reset exited with ${run.code}`, run.output);
    const after = await readState(pool);
    expectFreshDemo(after, run.output);
    expectThat(requestsSince(own, mark, 'DELETE') === before.signIns.length, `expected ${before.signIns.length} sign-ins deleted`, run.output);
    expectThat(!after.signIns.some((id) => before.signIns.includes(id)), 'a sign-in from before the reset survived it', run.output);
  });

  await scenario('a key for another Supabase project is refused before anything changes', async () => {
    const before = await readState(pool);
    const otherBefore = await pool.query('SELECT id FROM other_project.users');
    const mark = other.requests.length;

    const run = await runReset(databaseUrl, other.url);
    expectThat(run.code === 1, `the reset exited with ${run.code} instead of refusing`, run.output);
    expectThat(run.output.includes('must be the same Supabase project'), 'the refusal does not explain the project mismatch', run.output);
    expectThat(requestsSince(other, mark, 'DELETE') === 0 && requestsSince(other, mark, 'POST') === 0, 'the other project was changed', run.output);
    const after = await readState(pool);
    expectThat(sameIds(before.accounts, after.accounts) && sameIds(before.signIns, after.signIns), 'the demo database changed', run.output);
    expectThat((await pool.query('SELECT id FROM other_project.users')).rowCount === otherBefore.rowCount, 'the other project lost users', run.output);
  });

  await scenario(`a Supabase Auth outage at ${OUTAGE_ACCOUNT} stops the seed part-way`, async () => {
    own.failCreateFor.add(OUTAGE_ACCOUNT);
    const run = await runReset(databaseUrl, own.url);
    expectThat(run.code === 1, `the reset exited with ${run.code} although the seed could not finish`, run.output);
    expectThat(run.output.includes('The demo seed failed'), 'the failure does not name the seed', run.output);
    const state = await readState(pool);
    expectThat(state.accounts.length === 1, `expected only ${ADMIN} to be created, found ${state.accounts.length} accounts`, run.output);
    expectThat(state.hasDemoOrganization, `${DEMO_ORGANIZATION.name} must exist before any account is created`, run.output);
  });

  await scenario('the next reset recovers the part-seeded database', async () => {
    own.failCreateFor.clear();
    const run = await runReset(databaseUrl, own.url);
    expectThat(run.code === 0, `the reset exited with ${run.code}`, run.output);
    expectFreshDemo(await readState(pool), run.output);
  });

  return passed;
}

function migrate(databaseUrl: string): void {
  const result = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
    cwd: PACKAGE_ROOT,
    env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl },
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new RehearsalFailed(`prisma migrate deploy failed:\n${result.stdout}${result.stderr}`);
}

async function main(): Promise<void> {
  const serverUrl = process.env.DATABASE_URL?.trim();
  if (!serverUrl) throw new RehearsalFailed('DATABASE_URL is not set: give the rehearsal a disposable PostgreSQL server.');
  const project = supabaseProjectOf(serverUrl);
  if (project && project !== 'local') {
    throw new RehearsalFailed(
      `DATABASE_URL points at Supabase project ${project}. The rehearsal creates and drops its own database, so give it a disposable PostgreSQL server instead.`,
    );
  }
  const url = new URL(serverUrl);
  url.pathname = `/${DATABASE_NAME}`;
  const databaseUrl = url.toString();

  const server = new Client({ connectionString: serverUrl });
  await server.connect();
  await server.query(`DROP DATABASE IF EXISTS ${DATABASE_NAME} WITH (FORCE)`);
  await server.query(`CREATE DATABASE ${DATABASE_NAME}`);
  try {
    migrate(databaseUrl);
    const pool = new Pool({ connectionString: databaseUrl, max: 4 });
    try {
      await pool.query(`
        CREATE SCHEMA auth;
        CREATE TABLE auth.users (${AUTH_USERS_COLUMNS});
        CREATE SCHEMA other_project;
        CREATE TABLE other_project.users (${AUTH_USERS_COLUMNS});
        INSERT INTO other_project.users (id, email)
          SELECT gen_random_uuid(), 'person' || n || '@other-project.example' FROM generate_series(1, 3) AS n;
      `);
      const own = await startAuthStandIn(pool, 'auth.users');
      const other = await startAuthStandIn(pool, 'other_project.users');
      try {
        console.log(`Rehearsing the demo reset on ${url.host}/${DATABASE_NAME} with a stand-in for the Supabase Auth admin API:`);
        const passed = await rehearse(pool, databaseUrl, own, other);
        console.log(`Demo reset rehearsal passed: ${passed.length} scenarios.`);
      } finally {
        await own.close();
        await other.close();
      }
    } finally {
      await pool.end();
    }
  } finally {
    await server.query(`DROP DATABASE IF EXISTS ${DATABASE_NAME} WITH (FORCE)`);
    await server.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof RehearsalFailed ? `Demo reset rehearsal failed: ${error.message}` : error);
  process.exitCode = 1;
});
