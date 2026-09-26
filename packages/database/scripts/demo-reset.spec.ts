import { DEMO_ACCOUNTS, DEMO_ACCOUNT_PASSWORD } from '@topflow/shared';
import {
  CONFIRM_FLAG,
  DEMO_SEED_EMAILS,
  DemoResetRefused,
  assessTarget,
  checkPreconditions,
  compareIdentities,
  demoSeedEnvironment,
  describeDatabase,
  listAllIdentities,
  resetDemo,
  supabaseProjectOf,
  truncateStatement,
  type IdentityDirectory,
  type ResetDependencies,
  type TargetFacts,
} from './demo-reset-core';

const DATABASE_URL = 'postgresql://postgres:s3cret@127.0.0.1:54500/topflow_test';
const ready = { DEMO_MODE: 'true', DATABASE_URL };
const LOCAL_SUPABASE = 'http://127.0.0.1:54321';
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
      expect(problemsOf({ ...ready, SUPABASE_URL: LOCAL_SUPABASE })).toEqual([expect.stringContaining('SUPABASE_SECRET_KEY')]);
      const both = checkPreconditions({ ...ready, SUPABASE_URL: LOCAL_SUPABASE, SUPABASE_SECRET_KEY: 'sb_secret_x' }, [CONFIRM_FLAG]);
      expect(both).toMatchObject({ ok: true, plan: { supabase: { url: LOCAL_SUPABASE, secretKey: 'sb_secret_x' } } });
      const skipped = checkPreconditions({ ...ready, SUPABASE_URL: LOCAL_SUPABASE, SEED_IDENTITIES: 'false' }, [CONFIRM_FLAG]);
      expect(skipped).toMatchObject({ ok: true, plan: { supabase: null } });
    });

    it('refuses Supabase settings of a different project than the database', () => {
      const demoDatabase = 'postgresql://postgres.demoref:pw@aws-1-ap-south-1.pooler.supabase.com:5432/postgres';
      const withKeys = (SUPABASE_URL: string, DATABASE_URL: string) =>
        problemsOf({ ...ready, DATABASE_URL, SUPABASE_URL, SUPABASE_SECRET_KEY: 'sb_secret_x' });

      expect(withKeys('https://prodref.supabase.co', demoDatabase)).toEqual([
        expect.stringMatching(/^SUPABASE_URL belongs to project prodref but DATABASE_URL to project demoref\./),
      ]);
      expect(withKeys(LOCAL_SUPABASE, demoDatabase)).toEqual([expect.stringContaining('a local Supabase stack but DATABASE_URL to project demoref')]);
      expect(withKeys('https://demoref.supabase.co', DATABASE_URL)).toEqual([expect.stringContaining('project demoref but DATABASE_URL to a local')]);

      expect(withKeys('https://demoref.supabase.co', demoDatabase)).toEqual([]);
      expect(withKeys('https://demoref.supabase.co', 'postgresql://postgres:pw@db.demoref.supabase.co:5432/postgres')).toEqual([]);
      // Addresses that do not name a project are left to the auth.users comparison in resetDemo.
      expect(withKeys('https://auth.demo.example', 'postgresql://postgres:pw@postgres:5432/demo')).toEqual([]);
      // Without Supabase settings no sign-in is touched, so nothing needs to match.
      expect(problemsOf({ ...ready, DATABASE_URL: demoDatabase })).toEqual([]);
    });
  });

  describe('supabaseProjectOf', () => {
    it.each([
      ['https://abcdefghijklmnopqrst.supabase.co', 'abcdefghijklmnopqrst'],
      ['https://abcdefghijklmnopqrst.supabase.co/', 'abcdefghijklmnopqrst'],
      ['postgresql://postgres:pw@db.abcdefghijklmnopqrst.supabase.co:5432/postgres', 'abcdefghijklmnopqrst'],
      ['postgresql://postgres.abcdefghijklmnopqrst:pw@aws-1-ap-south-1.pooler.supabase.com:6543/postgres', 'abcdefghijklmnopqrst'],
      ['http://127.0.0.1:54321', 'local'],
      ['postgresql://postgres:postgres@localhost:54322/postgres', 'local'],
      ['postgresql://postgres:postgres@postgres:5432/topflow_test', null],
      ['https://auth.topflow.example', null],
      ['not a url', null],
    ])('reads %s as %p', (address, project) => {
      expect(supabaseProjectOf(address)).toBe(project);
    });
  });

  describe('compareIdentities', () => {
    it('accepts the same sign-ins in the project and in the database', () => {
      expect(compareIdentities(['a', 'b'], ['b', 'a'])).toBeNull();
      expect(compareIdentities([], [])).toBeNull();
    });

    it('refuses a database without auth.users when Supabase settings are given', () => {
      expect(compareIdentities([], null)).toMatch(/no auth\.users table.*Nothing was changed/);
    });

    it('refuses sign-ins that the database does not hold, and the other way round', () => {
      expect(compareIdentities(['prod-1', 'prod-2'], ['demo-1'])).toMatch(/2 are only in the project and 1 only in the database/);
      expect(compareIdentities([], ['demo-1'])).toMatch(/0 are only in the project and 1 only in the database/);
    });
  });

  describe('assessTarget', () => {
    const facts = (overrides: Partial<TargetFacts>): TargetFacts => ({
      tables: APP_TABLES,
      users: 8,
      otherAccounts: 0,
      hasDemoOrganization: true,
      authUserIds: null,
      ...overrides,
    });

    it('accepts the demo database and an empty one', () => {
      expect(assessTarget(facts({}))).toBeNull();
      expect(assessTarget(facts({ users: 0, hasDemoOrganization: false }))).toBeNull();
      // Visitors' own accounts do not matter once Desert Bloom is there.
      expect(assessTarget(facts({ users: 12, otherAccounts: 4 }))).toBeNull();
    });

    it('accepts what a demo seed that failed after its first account leaves behind', () => {
      expect(assessTarget(facts({ users: 1, otherAccounts: 0, hasDemoOrganization: false }))).toBeNull();
    });

    it('refuses a database with other accounts but no demo data set', () => {
      expect(assessTarget(facts({ users: 1250, otherAccounts: 1250, hasDemoOrganization: false }))).toMatch(
        /holds 1250 account\(s\), 1250 of them not created by the demo seed, and not the demo data set .*Nothing was changed/,
      );
      // One account that the demo seed does not create is enough.
      expect(assessTarget(facts({ users: 3, otherAccounts: 1, hasDemoOrganization: false }))).toMatch(/1 of them not created by the demo seed/);
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

  it('knows every account the demo seed creates', () => {
    expect(DEMO_SEED_EMAILS).toEqual([...DEMO_ACCOUNTS.map((account) => account.email), 'owner@alwaha.example']);
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
        facts: () =>
          Promise.resolve({
            tables: APP_TABLES,
            users: 8,
            otherAccounts: 0,
            hasDemoOrganization: true,
            authUserIds: identities ? [...identities.ids] : null,
            ...facts,
          }),
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

  it('changes nothing when the Supabase project is not the database’s own', async () => {
    // A key copied from another project: its users are not in this database's auth.users.
    const { deps, steps } = harness({ authUserIds: ['demo-1', 'demo-2'] });
    await expect(resetDemo(ready, deps)).rejects.toThrow(/3 are only in the project and 2 only in the database/);
    expect(steps).toEqual(['list page 1']);
  });

  it('changes nothing when Supabase settings are given for a database without auth.users', async () => {
    const { deps, steps } = harness({ authUserIds: null });
    await expect(resetDemo(ready, deps)).rejects.toBeInstanceOf(DemoResetRefused);
    expect(steps).toEqual(['list page 1']);
  });

  it('changes nothing when the target does not look like the demo database', async () => {
    const { deps, steps } = harness({ users: 1250, otherAccounts: 1250, hasDemoOrganization: false });
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

  it('runs again after a seed that failed after its first account', async () => {
    // The database as each step leaves it. The seed creates Desert Bloom before any account, but even
    // a database holding only the first demo account and no Desert Bloom must not lock the reset out.
    let state = { users: 8, otherAccounts: 0, hasDemoOrganization: true };
    const { deps, steps } = harness({}, null);
    deps.database = {
      facts: () => Promise.resolve({ tables: APP_TABLES, authUserIds: null, ...state }),
      truncate: () => {
        steps.push('truncate');
        state = { users: 0, otherAccounts: 0, hasDemoOrganization: false };
        return Promise.resolve();
      },
    };
    deps.seed = () => {
      steps.push('seed fails after admin@topflow.example');
      state = { users: 1, otherAccounts: 0, hasDemoOrganization: false };
      return Promise.reject(new Error('The demo seed failed (exit code 1).'));
    };
    await expect(resetDemo(ready, deps)).rejects.toThrow('demo seed failed');

    deps.seed = () => {
      steps.push('seed');
      state = { users: 8, otherAccounts: 0, hasDemoOrganization: true };
      return Promise.resolve();
    };
    await expect(resetDemo(ready, deps)).resolves.toEqual({ tables: 5, identitiesRemoved: 0 });
    expect(steps).toEqual(['truncate', 'seed fails after admin@topflow.example', 'truncate', 'seed']);
  });
});
