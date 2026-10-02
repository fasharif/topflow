import { DEMO_ACCOUNT_PASSWORD, DEMO_ACCOUNTS } from '@topflow/shared';
import type * as ActionsModule from './actions';

/*
 * The authentication Server Actions in and out of the portfolio demo (ADR-021). Supabase is replaced
 * by a recorder, so each test shows exactly which Supabase Auth calls an action made. In demo mode an
 * action that would send an email or change a shared account's password or two-factor settings must
 * return `demo_restricted` without calling Supabase at all.
 */

interface Call {
  method: string;
  args: unknown[];
}

type Claims = { email?: string; amr?: Array<{ method: string; timestamp: number }> } | null;

/** Supabase Auth calls that send an email or change an account. */
const MUTATING = new Set([
  'signUp',
  'resend',
  'resetPasswordForEmail',
  'updateUser',
  'mfa.enroll',
  'mfa.unenroll',
  'mfa.challengeAndVerify',
]);

function fakeSupabase(claims: Claims) {
  const calls: Call[] = [];
  const record =
    (method: string, result: unknown) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
      return Promise.resolve(result);
    };
  const client = {
    auth: {
      signInWithPassword: record('signInWithPassword', { data: {}, error: null }),
      signUp: record('signUp', { data: { session: null }, error: null }),
      signOut: record('signOut', { error: null }),
      resend: record('resend', { error: null }),
      resetPasswordForEmail: record('resetPasswordForEmail', { data: {}, error: null }),
      getClaims: record('getClaims', { data: claims ? { claims } : null, error: null }),
      updateUser: record('updateUser', { data: {}, error: null }),
      mfa: {
        listFactors: record('mfa.listFactors', { data: { all: [], totp: [{ id: 'factor-1', status: 'verified' }] }, error: null }),
        getAuthenticatorAssuranceLevel: record('mfa.getAuthenticatorAssuranceLevel', {
          data: { currentLevel: 'aal1', nextLevel: 'aal1' },
          error: null,
        }),
        enroll: record('mfa.enroll', { data: { id: 'factor-2', totp: { qr_code: 'qr', secret: 'secret' } }, error: null }),
        unenroll: record('mfa.unenroll', { data: {}, error: null }),
        challengeAndVerify: record('mfa.challengeAndVerify', { data: {}, error: null }),
      },
    },
  };
  return { client, calls, mutations: () => calls.filter((call) => MUTATING.has(call.method)) };
}

const mockSupabase: { current: ReturnType<typeof fakeSupabase>['client'] | null } = { current: null };

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => Promise.resolve(mockSupabase.current),
}));
jest.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers({ host: 'localhost:3002' })),
}));

/** Loads the actions as a build with NEXT_PUBLIC_DEMO_MODE set to `demoMode` (the flag is read once). */
function loadActions(demoMode: boolean): typeof ActionsModule {
  const previous = process.env.NEXT_PUBLIC_DEMO_MODE;
  process.env.NEXT_PUBLIC_DEMO_MODE = String(demoMode);
  let actions: typeof ActionsModule | undefined;
  jest.isolateModules(() => {
    actions = jest.requireActual<typeof ActionsModule>('./actions');
  });
  process.env.NEXT_PUBLIC_DEMO_MODE = previous;
  if (!actions) throw new Error('Could not load the Server Actions');
  return actions;
}

function signedIn(email: string, method: string): Claims {
  return { email, amr: [{ method, timestamp: 1_790_000_000 }] };
}

const SHARED_ADMIN = DEMO_ACCOUNTS.find((account) => account.label === 'Administrator')?.email ?? '';
const NEW_PASSWORD = 'Str0nger-password';

type Scenario = [name: string, claims: Claims, run: (actions: typeof ActionsModule) => Promise<unknown>];

/** Every action the demo refuses, with the session it is tried from. */
const REFUSED: Scenario[] = [
  [
    'signUp',
    null,
    (a) =>
      a.signUp({
        accountType: 'personal',
        details: { email: 'visitor@example.org', password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD, fullName: 'Demo Visitor' } as never,
      }),
  ],
  ['resendConfirmation', null, (a) => a.resendConfirmation({ email: 'visitor@example.org' })],
  ['requestPasswordReset', null, (a) => a.requestPasswordReset({ email: SHARED_ADMIN })],
  [
    'changePassword',
    signedIn(SHARED_ADMIN, 'password'),
    (a) => a.changePassword({ currentPassword: DEMO_ACCOUNT_PASSWORD, newPassword: NEW_PASSWORD }),
  ],
  [
    'setNewPassword on a shared account signed in with the published password',
    signedIn(SHARED_ADMIN, 'password'),
    (a) => a.setNewPassword({ password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD }),
  ],
  [
    'setNewPassword on a shared account, even from a recovery link',
    signedIn(SHARED_ADMIN, 'recovery'),
    (a) => a.setNewPassword({ password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD }),
  ],
  [
    'setNewPassword on an own account without an invitation or recovery link',
    signedIn('visitor@example.org', 'password'),
    (a) => a.setNewPassword({ password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD }),
  ],
  ['startTotpEnrollment', signedIn(SHARED_ADMIN, 'password'), (a) => a.startTotpEnrollment()],
  ['verifyTotp completing an enrolment', signedIn(SHARED_ADMIN, 'password'), (a) => a.verifyTotp({ code: '123456', factorId: 'factor-2' })],
  ['removeTotp', signedIn(SHARED_ADMIN, 'totp'), (a) => a.removeTotp({ factorId: 'factor-1' })],
];

/** Actions the demo keeps, because signing in and out must work for every visitor. */
const ALLOWED = ['signInWithPassword', 'signOut', 'getMfaStatus', 'verifyTotp'];

describe('authentication Server Actions', () => {
  afterEach(() => {
    mockSupabase.current = null;
  });

  describe('in the portfolio demo', () => {
    const actions = loadActions(true);

    it.each(REFUSED)('refuses %s without calling Supabase Auth', async (_name, claims, run) => {
      const supabase = fakeSupabase(claims);
      mockSupabase.current = supabase.client;
      await expect(run(actions)).resolves.toMatchObject({ ok: false, code: 'demo_restricted', error: expect.stringContaining('demo') });
      expect(supabase.mutations()).toEqual([]);
      expect(supabase.calls.filter((call) => call.method === 'signOut')).toEqual([]);
    });

    it('still signs visitors in, and completes a sign-in challenge', async () => {
      const supabase = fakeSupabase(null);
      mockSupabase.current = supabase.client;
      await expect(actions.signInWithPassword({ email: SHARED_ADMIN, password: DEMO_ACCOUNT_PASSWORD })).resolves.toMatchObject({ ok: true });
      await expect(actions.verifyTotp({ code: '123456' })).resolves.toEqual({ ok: true, data: undefined });
      expect(supabase.calls.map((call) => call.method)).toContain('mfa.challengeAndVerify');
    });

    it('never ends other visitors’ sessions on a shared account', async () => {
      const supabase = fakeSupabase(signedIn(SHARED_ADMIN, 'password'));
      mockSupabase.current = supabase.client;
      await actions.signOut('global');
      expect(supabase.calls).toEqual([{ method: 'signOut', args: [{ scope: 'local' }] }]);
    });

    it('lets an invited person choose the password of their own account', async () => {
      const supabase = fakeSupabase(signedIn('maintainer@example.org', 'invite'));
      mockSupabase.current = supabase.client;
      await expect(actions.setNewPassword({ password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD })).resolves.toEqual({ ok: true, data: undefined });
      expect(supabase.mutations()).toEqual([{ method: 'updateUser', args: [{ password: NEW_PASSWORD }] }]);
      expect(supabase.calls.filter((call) => call.method === 'signOut')).toEqual([]);
    });
  });

  describe('outside the demo', () => {
    const actions = loadActions(false);

    it('sets a new password after a recovery link and ends every other session', async () => {
      const supabase = fakeSupabase(signedIn('customer@example.com', 'recovery'));
      mockSupabase.current = supabase.client;
      await expect(actions.setNewPassword({ password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD })).resolves.toEqual({ ok: true, data: undefined });
      expect(supabase.calls.map((call) => call.method)).toEqual(['getClaims', 'updateUser', 'signOut']);
      expect(supabase.calls.at(-1)).toEqual({ method: 'signOut', args: [{ scope: 'others' }] });
    });

    it('changes passwords and sends reset emails as usual', async () => {
      const supabase = fakeSupabase(signedIn('customer@example.com', 'password'));
      mockSupabase.current = supabase.client;
      await expect(actions.changePassword({ currentPassword: DEMO_ACCOUNT_PASSWORD, newPassword: NEW_PASSWORD })).resolves.toMatchObject({ ok: true });
      await expect(actions.requestPasswordReset({ email: 'customer@example.com' })).resolves.toMatchObject({ ok: true });
      expect(supabase.mutations().map((call) => call.method)).toEqual(['updateUser', 'resetPasswordForEmail']);
    });

    it('signs out of every device when asked', async () => {
      const supabase = fakeSupabase(signedIn('customer@example.com', 'password'));
      mockSupabase.current = supabase.client;
      await actions.signOut('global');
      expect(supabase.calls).toEqual([{ method: 'signOut', args: [{ scope: 'global' }] }]);
    });
  });

  it('gives every exported action a demo-mode decision', () => {
    // A new action must be added to REFUSED or ALLOWED above, so nobody adds one and forgets the demo.
    const actions = loadActions(true);
    const exported = Object.keys(actions).filter((name) => typeof (actions as Record<string, unknown>)[name] === 'function');
    const decided = new Set([...REFUSED.map(([name]) => name.split(' ')[0]), ...ALLOWED]);
    expect(exported.sort()).toEqual([...decided].sort());
  });
});
