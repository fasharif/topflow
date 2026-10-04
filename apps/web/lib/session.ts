'use client';

import { ErrorCode, type ApiErrorBody, type AuthUser, type MembershipSummary } from '@topflow/shared';
import { useSyncExternalStore } from 'react';
import { signOut as endSupabaseSession } from '@/lib/auth/actions';

/**
 * Client view of the signed-in user.
 *
 * Security model: the Supabase session lives in httpOnly cookies that only this app's server can
 * read. Browser code never holds an access or refresh token. It asks /api/auth/me who the user is
 * (the request is forwarded with the session), and the API authorises every call on its own.
 */
export type SessionStatus = 'loading' | 'authenticated' | 'anonymous';

export interface SessionState {
  status: SessionStatus;
  user: AuthUser | null;
  activeOrganizationId: string | null;
  /**
   * The API's reason for refusing an identity that is signed in with Supabase (a disabled account, or
   * an email address that belongs to another account). The sign-in page shows it.
   */
  accountProblem: string | null;
}

const ACTIVE_ORG_KEY = 'topflow.activeOrganization';
const SERVER_STATE: SessionState = { status: 'loading', user: null, activeOrganizationId: null, accountProblem: null };

let state: SessionState = SERVER_STATE;
const listeners = new Set<() => void>();

function setState(patch: Partial<SessionState>): void {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

export const sessionStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot: (): SessionState => state,
  getServerSnapshot: (): SessionState => SERVER_STATE,
};

function readActiveOrganization(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_ORG_KEY);
  } catch {
    return null;
  }
}

function writeActiveOrganization(organizationId: string | null): void {
  try {
    if (organizationId) window.localStorage.setItem(ACTIVE_ORG_KEY, organizationId);
    else window.localStorage.removeItem(ACTIVE_ORG_KEY);
  } catch {
    // Storage unavailable (private mode): the choice simply won't persist.
  }
}

/** Applies the platform user from GET /auth/me, or null when nobody is signed in. */
export function applyUser(user: AuthUser | null): void {
  if (!user) {
    setState({ status: 'anonymous', user: null, activeOrganizationId: null, accountProblem: null });
    return;
  }
  const preferred = readActiveOrganization();
  const activeOrganizationId = user.memberships.some((m) => m.organizationId === preferred)
    ? preferred
    : (user.memberships[0]?.organizationId ?? null);
  setState({ status: 'authenticated', user, activeOrganizationId, accountProblem: null });
}

/** Replaces the user after a profile change (PATCH /me returns the refreshed AuthUser). */
export function updateUser(user: AuthUser): void {
  applyUser(user);
}

export function setActiveOrganization(organizationId: string): void {
  writeActiveOrganization(organizationId);
  setState({ activeOrganizationId: organizationId });
}

/**
 * The API's reason when GET /auth/me refuses an identity that is signed in with Supabase: 401
 * ACCOUNT_DISABLED for a disabled account, 409 ACCOUNT_CONFLICT for an email address that belongs to
 * another account. `null` for every other answer, such as the plain 401 of a visitor.
 */
async function accountRefusal(response: Response): Promise<string | null> {
  if (response.status !== 401 && response.status !== 409) return null;
  const body = (await response.json().catch(() => ({}))) as Partial<ApiErrorBody>;
  const refused =
    (response.status === 401 && body.code === ErrorCode.ACCOUNT_DISABLED) ||
    (response.status === 409 && body.code === ErrorCode.ACCOUNT_CONFLICT);
  if (!refused) return null;
  return body.message || 'This account cannot be used. Please contact Top Flow.';
}

let loadInFlight: Promise<boolean> | null = null;

/** Loads the signed-in user (memberships, permissions, MFA state). Concurrent callers share one request. */
export function refreshSession(): Promise<boolean> {
  loadInFlight ??= fetch('/api/auth/me', {
    headers: { accept: 'application/json' },
    credentials: 'same-origin',
    cache: 'no-store',
  })
    .then(async (response) => {
      if (response.ok) {
        applyUser((await response.json()) as AuthUser);
        return true;
      }
      const accountProblem = await accountRefusal(response);
      if (accountProblem === null) {
        applyUser(null);
        return false;
      }
      // Supabase accepted the identity but Top Flow does not: keep the reason for the sign-in page
      // and end the Supabase session, which every later page load would see refused again.
      writeActiveOrganization(null);
      setState({ status: 'anonymous', user: null, activeOrganizationId: null, accountProblem });
      try {
        await endSupabaseSession('local');
      } catch {
        // The interface already shows the visitor as signed out; the session cookie expires on its own.
      }
      return false;
    })
    .catch(() => {
      // A network failure is not a sign-out: keep a known user, otherwise show signed-out UI.
      if (state.status !== 'authenticated') applyUser(null);
      return state.status === 'authenticated';
    })
    .finally(() => {
      loadInFlight = null;
    });
  return loadInFlight;
}

/** Called once per page load. */
export function bootstrapSession(): void {
  void refreshSession();
}

/** Ends the session on this device, or on every device with scope 'global'. */
export async function signOut(scope: 'local' | 'global' = 'local'): Promise<void> {
  try {
    await endSupabaseSession(scope);
  } catch {
    // The local state is cleared regardless; the session cookie expires on its own.
  }
  writeActiveOrganization(null);
  applyUser(null);
}

export function useSession(): SessionState & {
  activeMembership: MembershipSummary | null;
} {
  const snapshot = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot, sessionStore.getServerSnapshot);
  const activeMembership =
    snapshot.user?.memberships.find((m) => m.organizationId === snapshot.activeOrganizationId) ?? null;
  return { ...snapshot, activeMembership };
}
