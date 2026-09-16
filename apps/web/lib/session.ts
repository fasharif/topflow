'use client';

import type { AuthUser, MembershipSummary } from '@topflow/shared';
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
}

const ACTIVE_ORG_KEY = 'topflow.activeOrganization';
const SERVER_STATE: SessionState = { status: 'loading', user: null, activeOrganizationId: null };

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
    setState({ status: 'anonymous', user: null, activeOrganizationId: null });
    return;
  }
  const preferred = readActiveOrganization();
  const activeOrganizationId = user.memberships.some((m) => m.organizationId === preferred)
    ? preferred
    : (user.memberships[0]?.organizationId ?? null);
  setState({ status: 'authenticated', user, activeOrganizationId });
}

/** Replaces the user after a profile change (PATCH /me returns the refreshed AuthUser). */
export function updateUser(user: AuthUser): void {
  applyUser(user);
}

export function setActiveOrganization(organizationId: string): void {
  writeActiveOrganization(organizationId);
  setState({ activeOrganizationId: organizationId });
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
      if (!response.ok) {
        applyUser(null);
        return false;
      }
      applyUser((await response.json()) as AuthUser);
      return true;
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
