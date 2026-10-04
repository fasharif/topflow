import { ErrorCode, Role, type AuthUser } from '@topflow/shared';
import { signOut as endSupabaseSession } from '@/lib/auth/actions';
import { refreshSession, sessionStore } from './session';

/*
 * The session store against a stand-in for fetch: what it does with the answers of GET /api/auth/me.
 * The sign-out Server Action, which deletes the Supabase session cookies, is replaced by a recorder
 * because it needs Next's request context.
 */

jest.mock('@/lib/auth/actions', () => ({ signOut: jest.fn(() => Promise.resolve()) }));

const signOutAction = jest.mocked(endSupabaseSession);
const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

beforeEach(() => {
  fetchMock.mockReset();
  signOutAction.mockClear();
  global.fetch = fetchMock as typeof fetch;
});

function answer(status: number, body: unknown): void {
  fetchMock.mockResolvedValue(Response.json(body, { status }));
}

const customer = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'customer@example.com',
  fullName: 'Demo Customer',
  role: Role.CUSTOMER,
  memberships: [],
} as unknown as AuthUser;

describe('refreshSession when the API refuses a signed-in identity', () => {
  it('keeps the reason and ends the Supabase session of a disabled account (401 ACCOUNT_DISABLED)', async () => {
    answer(401, {
      statusCode: 401,
      error: 'Unauthorized',
      message: 'This account has been disabled. Please contact Top Flow.',
      code: ErrorCode.ACCOUNT_DISABLED,
    });

    await expect(refreshSession()).resolves.toBe(false);

    expect(sessionStore.getSnapshot()).toEqual({
      status: 'anonymous',
      user: null,
      activeOrganizationId: null,
      accountProblem: 'This account has been disabled. Please contact Top Flow.',
    });
    expect(signOutAction).toHaveBeenCalledTimes(1);
    expect(signOutAction).toHaveBeenCalledWith('local');
  });

  it('does the same for an email address that belongs to another account (409 ACCOUNT_CONFLICT)', async () => {
    answer(409, {
      statusCode: 409,
      error: 'Conflict',
      message: 'This email address is linked to another Top Flow account. Please contact us.',
      code: ErrorCode.ACCOUNT_CONFLICT,
    });

    await expect(refreshSession()).resolves.toBe(false);

    expect(sessionStore.getSnapshot().status).toBe('anonymous');
    expect(sessionStore.getSnapshot().accountProblem).toBe('This email address is linked to another Top Flow account. Please contact us.');
    expect(signOutAction).toHaveBeenCalledWith('local');
  });

  it('still shows the reason when the session could not be ended', async () => {
    signOutAction.mockRejectedValueOnce(new Error('network'));
    answer(401, { statusCode: 401, message: 'This account has been disabled. Please contact Top Flow.', code: ErrorCode.ACCOUNT_DISABLED });

    await expect(refreshSession()).resolves.toBe(false);

    expect(sessionStore.getSnapshot().accountProblem).toBe('This account has been disabled. Please contact Top Flow.');
  });
});

describe('refreshSession in the ordinary cases', () => {
  it('shows a visitor as signed out, with no reason and no sign-out call', async () => {
    answer(401, { statusCode: 401, error: 'Unauthorized', message: 'Authentication required' });

    await expect(refreshSession()).resolves.toBe(false);

    expect(sessionStore.getSnapshot()).toEqual({ status: 'anonymous', user: null, activeOrganizationId: null, accountProblem: null });
    expect(signOutAction).not.toHaveBeenCalled();
  });

  it('applies the user, and forgets an earlier refusal', async () => {
    answer(401, { statusCode: 401, message: 'This account has been disabled. Please contact Top Flow.', code: ErrorCode.ACCOUNT_DISABLED });
    await refreshSession();
    expect(sessionStore.getSnapshot().accountProblem).not.toBeNull();

    answer(200, customer);
    await expect(refreshSession()).resolves.toBe(true);

    expect(sessionStore.getSnapshot()).toEqual({ status: 'authenticated', user: customer, activeOrganizationId: null, accountProblem: null });
  });

  it('keeps a known user when the request itself fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    await expect(refreshSession()).resolves.toBe(true);

    expect(sessionStore.getSnapshot().user).toEqual(customer);
    expect(signOutAction).not.toHaveBeenCalled();
  });
});
