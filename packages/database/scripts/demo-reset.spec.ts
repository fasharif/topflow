import { DEMO_ACCOUNT_PASSWORD } from '@topflow/shared';
import {
  CONFIRM_FLAG,
  DemoResetRefused,
  assessTarget,
  checkPreconditions,
  demoSeedEnvironment,
  describeDatabase,
  listAllIdentities,
  resetDemo,
  truncateStatement,
  type IdentityDirectory,
  type ResetDependencies,
  type TargetFacts,
} from './demo-reset-core';

const DATABASE_URL = 'postgresql://postgres:s3cret@127.0.0.1:54500/topflow_test';
const ready = { DEMO_MODE: 'true', DATABASE_URL };
const APP_TABLES = ['_prisma_migrations', 'audit_logs', 'organizations', 'orders', 'products', 'users'];

function problemsOf(env: NodeJS.ProcessEnv, args: string[] = [CONFIRM_FLAG]): string[] {
  const result = checkPreconditions(env, args);
  return result.ok ? [] : result.problems;
}

describe('demo reset safety checks', () => {
  describe('checkPreconditions', () => {
    it('accepts DEMO_MODE=true with --confirm and a database', () => {
      expect(checkPreconditions(ready, [CONFIRM_FLAG])).toEqual({
        ok: true,
        plan: { databaseUrl: DATABASE_URL, supabase: null },
      });
    });

    it('refuses to run unless DEMO_MODE=true', () => {
      for (const DEMO_MODE of [undefined, '', 'false', '0']) {
        expect(problemsOf({ ...ready, DEMO_MODE })).toEqual([
          'DEMO_MODE=true is required: demo:reset only runs against the public demo database.',
        ]);
      }
      expect(problemsOf({ ...ready, DEMO_MODE: 'yes' })).toEqual([expect.stringContaining('DEMO_MODE must be "true" or "false"')]);
    });

    it('refuses to run without the explicit confirmation flag', () => {
      expect(problemsOf(ready, [])).toEqual([`Pass ${CONFIRM_FLAG} to confirm that every table of the target database will be emptied.`]);
      expect(problemsOf(ready, ['--confirm=yes'])).toEqual([
        `Unknown argument(s): --confirm=yes. The only option is ${CONFIRM_FLAG}.`,
        `Pass ${CONFIRM_FLAG} to confirm that every table of the target database will be emptied.`,
      ]);
    });

    it('refuses production settings and a shared-password conflict', () => {
      expect(
        problemsOf({
          ...ready,
          NODE_ENV: 'production',
          SEED_PROFILE: 'production',
          SEED_CREDENTIALS_FILE: '/secure/credentials.tsv',
        }),
      ).toEqual([
        expect.stringContaining('NODE_ENV=production'),
        expect.stringContaining('SEED_PROFILE=production'),
        expect.stringContaining('SEED_CREDENTIALS_FILE'),
      ]);
    });

    it('reports every problem at once', () => {
      expect(problemsOf({}, [])).toHaveLength(3);
    });

    it('needs both Supabase settings or neither', () => {
      expect(problemsOf({ ...ready, SUPABASE_URL: 'https://demo.supabase.co' })).toEqual([expect.stringContaining('SUPABASE_SECRET_KEY')]);
      const both = checkPreconditions({ ...ready, SUPABASE_URL: 'https://demo.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_x' }, [CONFIRM_FLAG]);
      expect(both).toMatchObject({ ok: true, plan: { supabase: { url: 'https://demo.supabase.co', secretKey: 'sb_secret_x' } } });
      const skipped = checkPreconditions({ ...ready, SUPABASE_URL: 'https://demo.supabase.co', SEED_IDENTITIES: 'false' }, [CONFIRM_FLAG]);
      expect(skipped).toMatchObject({ ok: true, plan: { supabase: null } });
    });
  });

  describe('assessTarget', () => {
    const facts = (overrides: Partial<TargetFacts>): TargetFacts => ({
      tables: APP_TABLES,
      users: 8,
      hasDemoOrganization: true,
      ...overrides,
    });

    it('accepts the demo database and an empty one', () => {
      expect(assessTarget(facts({}))).toBeNull();
      expect(assessTarget(facts({ users: 0, hasDemoOrganization: false }))).toBeNull();
    });

    it('refuses a database with accounts but no demo data set', () => {
      expect(assessTarget(facts({ users: 1250, hasDemoOrganization: false }))).toMatch(
        /holds 1250 account\(s\) but not the demo data set .*Nothing was changed/,
      );
    });

    it('refuses a database without the platform schema', () => {
      expect(assessTarget(facts({ tables: [], users: 0 }))).toMatch(/npm run db:deploy/);
    });
  });

  describe('truncateStatement', () => {
    it('empties every application table in one statement and keeps the migration history', () => {
      expect(truncateStatement(APP_TABLES)).toBe(
        'TRUNCATE TABLE public."audit_logs", public."organizations", public."orders", public."products", public."users" RESTART IDENTITY CASCADE',
      );
    });

    it('quotes table names', () => {
      expect(truncateStatement(['odd"name'])).toBe('TRUNCATE TABLE public."odd""name" RESTART IDENTITY CASCADE');
    });

    it('refuses to build an empty statement', () => {
      expect(() => truncateStatement(['_prisma_migrations'])).toThrow('no application tables');
    });
  });

  it('seeds the demo profile with the published accounts and password', () => {
    const env = demoSeedEnvironment({
      ...ready,
      SUPABASE_URL: 'https://demo.supabase.co',
      SEED_DEMO_PASSWORD: 'something-else',
      SEED_ADMIN_EMAIL: 'boss@example.com',
      SEED_DEMO_DOCUMENTS: 'false',
      SEED_PROFILE: 'demo',
    });
    expect(env).toMatchObject({
      DATABASE_URL,
      SUPABASE_URL: 'https://demo.supabase.co',
      SEED_PROFILE: 'demo',
      SEED_DEMO_PASSWORD: DEMO_ACCOUNT_PASSWORD,
      SEED_RESET_PASSWORDS: 'true',
    });
    expect(env.SEED_ADMIN_EMAIL).toBeUndefined();
    expect(env.SEED_DEMO_DOCUMENTS).toBeUndefined();
  });

  it('never logs database credentials', () => {
    expect(describeDatabase(DATABASE_URL)).toBe('127.0.0.1:54500/topflow_test');
    expect(describeDatabase('not a url')).toBe('an unparseable DATABASE_URL');
  });
});

/** In-memory Supabase Auth directory with `count` users. */
function directory(count: number): IdentityDirectory & { ids: string[]; removed: string[] } {
  const ids = Array.from({ length: count }, (_, i) => `user-${i + 1}`);
  const removed: string[] = [];
  return {
    ids,
    removed,
    listIds: (page, perPage) => {
      const remaining = ids.filter((id) => !removed.includes(id));
      return Promise.resolve(remaining.slice((page - 1) * perPage, page * perPage));
    },
    remove: (id) => {
      removed.push(id);
      return Promise.resolve();
    },
  };
}

describe('listAllIdentities', () => {
  it('reads every page before anything is deleted', async () => {
    const users = directory(5);
    expect(await listAllIdentities(users, 2)).toEqual(users.ids);
    expect(users.removed).toEqual([]);
  });
});

describe('resetDemo', () => {
  function harness(facts: Partial<TargetFacts> = {}, identities: ReturnType<typeof directory> | null = directory(3)) {
    const steps: string[] = [];
    const seededWith: NodeJS.ProcessEnv[] = [];
    const deps: ResetDependencies = {
      database: {
        facts: () => Promise.resolve({ tables: APP_TABLES, users: 8, hasDemoOrganization: true, ...facts }),
        truncate: (statement) => {
          steps.push(`truncate ${statement.split(',').length} tables`);
          return Promise.resolve();
        },
      },
      identities: identities && {
        listIds: (page, perPage) => {
          steps.push(`list page ${page}`);
          return identities.listIds(page, perPage);
        },
        remove: (id) => {
          steps.push(`remove ${id}`);
          return identities.remove(id);
        },
      },
      seed: (env) => {
        steps.push('seed');
        seededWith.push(env);
        return Promise.resolve();
      },
      log: () => undefined,
    };
    return { deps, steps, seededWith, identities };
  }

  it('lists sign-ins, empties the tables, removes the sign-ins, then seeds', async () => {
    const { deps, steps, seededWith } = harness();
    await expect(resetDemo(ready, deps)).resolves.toEqual({ tables: 5, identitiesRemoved: 3 });
    expect(steps).toEqual(['list page 1', 'truncate 5 tables', 'remove user-1', 'remove user-2', 'remove user-3', 'seed']);
    expect(seededWith[0]).toMatchObject({ SEED_PROFILE: 'demo', SEED_DEMO_PASSWORD: DEMO_ACCOUNT_PASSWORD });
  });

  it('changes nothing when the target does not look like the demo database', async () => {
    const { deps, steps } = harness({ users: 1250, hasDemoOrganization: false });
    await expect(resetDemo(ready, deps)).rejects.toBeInstanceOf(DemoResetRefused);
    expect(steps).toEqual([]);
  });

  it('empties nothing when the Supabase credentials do not work', async () => {
    const { deps, steps } = harness();
    deps.identities = {
      listIds: () => Promise.reject(new Error('Could not list Supabase Auth users: Invalid API key')),
      remove: () => Promise.resolve(),
    };
    await expect(resetDemo(ready, deps)).rejects.toThrow('Invalid API key');
    expect(steps).toEqual([]);
  });

  it('works without Supabase credentials, as in CI', async () => {
    const { deps, steps } = harness({}, null);
    await expect(resetDemo(ready, deps)).resolves.toEqual({ tables: 5, identitiesRemoved: 0 });
    expect(steps).toEqual(['truncate 5 tables', 'seed']);
  });

  it('reports a failed seed', async () => {
    const { deps } = harness();
    deps.seed = () => Promise.reject(new Error('The demo seed failed (exit code 1).'));
    await expect(resetDemo(ready, deps)).rejects.toThrow('demo seed failed');
  });
});
