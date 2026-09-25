/**
 * The decisions behind `npm run demo:reset` (scripts/demo-reset.ts), kept free of I/O so each safety
 * check is unit-tested. The reset empties every table of the public demo's database, removes the
 * demo project's Supabase Auth users and loads the demo data set again (ADR-021).
 */
import { DEMO_ACCOUNT_PASSWORD, DEMO_ORGANIZATION, parseDemoModeFlag } from '@topflow/shared';

export const CONFIRM_FLAG = '--confirm';

/** Prisma's migration history: the reset keeps it so the schema stays deployed. */
const MIGRATIONS_TABLE = '_prisma_migrations';

/** Supabase Auth pages are read in full before anything is deleted; this bounds the loop. */
const MAX_IDENTITY_PAGES = 100;

export interface ResetPlan {
  databaseUrl: string;
  /** Supabase Auth administration of the demo project, or null when it has no sign-ins to replace. */
  supabase: { url: string; secretKey: string } | null;
}

export type Preconditions = { ok: true; plan: ResetPlan } | { ok: false; problems: string[] };

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * The Supabase project a SUPABASE_URL or DATABASE_URL belongs to: its project ref, `local` for a
 * loopback address (the Supabase CLI stack), or null when the address does not say (for example a
 * custom domain or a Docker host name).
 *
 * - `https://<ref>.supabase.co`
 * - `postgresql://postgres:…@db.<ref>.supabase.co:5432/postgres` (direct connection)
 * - `postgresql://postgres.<ref>:…@aws-1-<region>.pooler.supabase.com:5432/postgres` (Supavisor)
 */
export function supabaseProjectOf(address: string): string | null {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (LOOPBACK_HOSTS.has(host)) return 'local';
  const project = /^(?:db\.)?([a-z0-9]+)\.supabase\.(?:co|in)$/.exec(host);
  if (project) return project[1] ?? null;
  if (host.endsWith('.pooler.supabase.com')) {
    const pooled = /^[^.]+\.([a-z0-9]+)$/.exec(decodeURIComponent(url.username).toLowerCase());
    return pooled?.[1] ?? null;
  }
  return null;
}

function describeProject(project: string): string {
  return project === 'local' ? 'a local Supabase stack' : `project ${project}`;
}

/**
 * Everything that must hold before the reset touches a database. All problems are reported at once,
 * so a misconfigured scheduled run explains itself in a single log.
 */
export function checkPreconditions(env: NodeJS.ProcessEnv, args: readonly string[]): Preconditions {
  const problems: string[] = [];

  try {
    if (!parseDemoModeFlag(env.DEMO_MODE)) {
      problems.push('DEMO_MODE=true is required: demo:reset only runs against the public demo database.');
    }
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
  }

  const unknown = args.filter((arg) => arg !== CONFIRM_FLAG);
  if (unknown.length > 0) {
    problems.push(`Unknown argument(s): ${unknown.join(' ')}. The only option is ${CONFIRM_FLAG}.`);
  }
  if (!args.includes(CONFIRM_FLAG)) {
    problems.push(`Pass ${CONFIRM_FLAG} to confirm that every table of the target database will be emptied.`);
  }

  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) problems.push('DATABASE_URL is not set.');
  if (env.NODE_ENV === 'production') {
    problems.push('NODE_ENV=production: the demo reset never runs in a production environment.');
  }
  if (env.SEED_PROFILE === 'production') {
    problems.push('SEED_PROFILE=production: the demo is always loaded with the demo profile.');
  }
  if (env.SEED_CREDENTIALS_FILE) {
    problems.push('SEED_CREDENTIALS_FILE is set: the demo accounts share the published password, so no credentials file is written.');
  }

  const supabaseUrl = env.SUPABASE_URL?.trim();
  const secretKey = env.SUPABASE_SECRET_KEY?.trim();
  const identities = env.SEED_IDENTITIES !== 'false';
  if (identities && Boolean(supabaseUrl) !== Boolean(secretKey)) {
    problems.push('Set both SUPABASE_URL and SUPABASE_SECRET_KEY of the demo project, or neither (SEED_IDENTITIES=false skips sign-ins).');
  }
  if (identities && supabaseUrl && secretKey && databaseUrl) {
    // The reset deletes every sign-in of SUPABASE_URL's project, so it must be the database's own project.
    const authProject = supabaseProjectOf(supabaseUrl);
    const databaseProject = supabaseProjectOf(databaseUrl);
    if (authProject && databaseProject && authProject !== databaseProject) {
      problems.push(
        `SUPABASE_URL belongs to ${describeProject(authProject)} but DATABASE_URL to ${describeProject(databaseProject)}. ` +
          'The reset deletes every sign-in of the SUPABASE_URL project, so both must point to the demo project.',
      );
    }
  }

  if (problems.length > 0 || !databaseUrl) return { ok: false, problems };
  return {
    ok: true,
    plan: {
      databaseUrl,
      supabase: identities && supabaseUrl && secretKey ? { url: supabaseUrl, secretKey } : null,
    },
  };
}

/** What the reset learns about the target database before changing it. */
export interface TargetFacts {
  /** Tables in the `public` schema. */
  tables: string[];
  /** Rows in `public.users`. */
  users: number;
  hasDemoOrganization: boolean;
  /**
   * Ids in the database's own `auth.users` table, which every Supabase project's database has, or
   * null when there is no such table (plain PostgreSQL, as in CI).
   */
  authUserIds: string[] | null;
}

/**
 * The last line of defence against a wrong DATABASE_URL: a database is reset only when it is empty
 * or already holds the demo data set. A production database has accounts but no Desert Bloom.
 */
export function assessTarget(facts: TargetFacts): string | null {
  if (!facts.tables.includes('users') || !facts.tables.includes('organizations')) {
    return 'The database has no platform tables. Run `npm run db:deploy` against it first.';
  }
  if (facts.users > 0 && !facts.hasDemoOrganization) {
    return (
      `The database holds ${facts.users} account(s) but not the demo data set ` +
      `(${DEMO_ORGANIZATION.name}, TRN ${DEMO_ORGANIZATION.trn}), so it does not look like the demo database. Nothing was changed.`
    );
  }
  return null;
}

function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** One TRUNCATE for every application table, so it runs atomically and foreign keys never get in the way. */
export function truncateStatement(tables: readonly string[]): string {
  const targets = tables.filter((table) => table !== MIGRATIONS_TABLE);
  if (targets.length === 0) throw new Error('There are no application tables to empty.');
  return `TRUNCATE TABLE ${targets.map((table) => `public.${quoteIdentifier(table)}`).join(', ')} RESTART IDENTITY CASCADE`;
}

/** A safety check stopped the reset before it changed anything. */
export class DemoResetRefused extends Error {}

/** The part of the Supabase Auth admin API the reset uses. */
export interface IdentityDirectory {
  /** Ids of one page of users (pages start at 1). */
  listIds(page: number, perPage: number): Promise<string[]>;
  remove(id: string): Promise<void>;
}

/**
 * Every sign-in of the demo project. All pages are read before the first deletion, because deleting
 * shifts the pages, and reading first shows that the Supabase key works before any table is emptied.
 */
export async function listAllIdentities(directory: IdentityDirectory, perPage = 1000): Promise<string[]> {
  const ids: string[] = [];
  for (let page = 1; ; page++) {
    if (page > MAX_IDENTITY_PAGES) {
      throw new DemoResetRefused(`The demo project has more than ${MAX_IDENTITY_PAGES * perPage} sign-ins; refusing to continue.`);
    }
    const batch = await directory.listIds(page, perPage);
    ids.push(...batch);
    if (batch.length < perPage) break;
  }
  return ids;
}

/**
 * Proof that SUPABASE_URL and DATABASE_URL are the same Supabase project, before any sign-in is
 * deleted: the users that the Auth admin API lists must be exactly the rows of the database's own
 * `auth.users` table. Two projects never share user ids, so a key copied from another project (the
 * production one, say) is refused even when both addresses look right.
 */
export function compareIdentities(listed: readonly string[], inDatabase: readonly string[] | null): string | null {
  if (inDatabase === null) {
    return (
      'SUPABASE_URL and SUPABASE_SECRET_KEY are set, but the database at DATABASE_URL has no auth.users table, so the reset ' +
      'cannot prove that they belong to the same Supabase project. Point DATABASE_URL at the demo project’s own database, or ' +
      'unset the Supabase settings (or set SEED_IDENTITIES=false) to reset the data only. Nothing was changed.'
    );
  }
  const database = new Set(inDatabase);
  const directory = new Set(listed);
  const onlyInDirectory = listed.filter((id) => !database.has(id)).length;
  const onlyInDatabase = inDatabase.filter((id) => !directory.has(id)).length;
  if (onlyInDirectory === 0 && onlyInDatabase === 0) return null;
  return (
    `The Supabase project at SUPABASE_URL lists ${listed.length} sign-in(s) and the database's auth.users holds ${inDatabase.length}; ` +
    `${onlyInDirectory} are only in the project and ${onlyInDatabase} only in the database. SUPABASE_URL and DATABASE_URL ` +
    'must be the same Supabase project, because the reset deletes every sign-in of that project. Nothing was changed.'
  );
}

/** Seed settings the demo never uses: the published accounts, their shared password and all documents. */
const IGNORED_SEED_SETTINGS = [
  'SEED_ACCOUNTS',
  'SEED_ADMIN_EMAIL',
  'SEED_CREDENTIALS_FILE',
  'SEED_CUSTOMER_EMAIL',
  'SEED_DEMO_DOCUMENTS',
  'SEED_FORCE',
  'SEED_KEEP_UNLISTED',
  'SEED_PRUNE_UNLISTED',
  'SEED_SALES_EMAIL',
  'SEED_WAREHOUSE_EMAIL',
];

/** Environment for `prisma/seed.ts`: the demo profile with the published accounts and password. */
export function demoSeedEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const seedEnv: NodeJS.ProcessEnv = { ...env };
  for (const name of IGNORED_SEED_SETTINGS) delete seedEnv[name];
  return {
    ...seedEnv,
    SEED_PROFILE: 'demo',
    SEED_DEMO_PASSWORD: DEMO_ACCOUNT_PASSWORD,
    SEED_RESET_PASSWORDS: 'true',
  };
}

/** `host:port/database` for logs, never the user name or password. */
export function describeDatabase(databaseUrl: string): string {
  try {
    const url = new URL(databaseUrl);
    return `${url.host}${url.pathname}`;
  } catch {
    return 'an unparseable DATABASE_URL';
  }
}

export interface DemoDatabase {
  facts(): Promise<TargetFacts>;
  /** Runs the TRUNCATE inside a transaction. */
  truncate(statement: string): Promise<void>;
}

export interface ResetDependencies {
  database: DemoDatabase;
  identities: IdentityDirectory | null;
  /** Loads the demo data set; rejects when the seed fails. */
  seed(env: NodeJS.ProcessEnv): Promise<void>;
  log(message: string): void;
}

export interface ResetSummary {
  tables: number;
  identitiesRemoved: number;
}

/**
 * 1. Refuse a database that holds accounts but not the demo data set. 2. List the demo project's sign-ins
 * (read-only) and refuse unless they are exactly the database's own auth.users. 3. Empty every
 * application table in one transaction. 4. Remove those sign-ins: changed passwords, enrolled
 * authenticators and visitors' own accounts go with them. 5. Run the demo seed, which creates the
 * published accounts again.
 */
export async function resetDemo(env: NodeJS.ProcessEnv, deps: ResetDependencies): Promise<ResetSummary> {
  const facts = await deps.database.facts();
  const problem = assessTarget(facts);
  if (problem) throw new DemoResetRefused(problem);
  const statement = truncateStatement(facts.tables);
  const identityIds = deps.identities ? await listAllIdentities(deps.identities) : [];
  if (deps.identities) {
    const mismatch = compareIdentities(identityIds, facts.authUserIds);
    if (mismatch) throw new DemoResetRefused(mismatch);
  }

  await deps.database.truncate(statement);
  const tables = facts.tables.filter((table) => table !== MIGRATIONS_TABLE).length;
  deps.log(`Emptied ${tables} tables (${facts.users} account(s) before the reset).`);

  if (deps.identities) {
    for (const id of identityIds) await deps.identities.remove(id);
    deps.log(`Removed ${identityIds.length} Supabase Auth user(s).`);
  } else {
    deps.log('No Supabase credentials: sign-in identities were left alone.');
  }

  await deps.seed(demoSeedEnvironment(env));
  return { tables, identitiesRemoved: identityIds.length };
}
