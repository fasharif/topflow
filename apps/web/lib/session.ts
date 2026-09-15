'use client';

import { useSyncExternalStore } from 'react';
import type { AuthSession, AuthUser, MembershipSummary } from '@topflow/shared';

/**
 * Client session store.
 *
 * Security model: the access token lives only in memory (never localStorage), so an XSS
 * payload cannot read a long-lived credential. The refresh token is an httpOnly cookie set
 * by the API and sent automatically to /api/auth/refresh. On page load we exchange that
 * cookie for a fresh access token. (The previous version stored the JWT in localStorage.)
 */
export type SessionStatus = 'loading' | 'authenticated' | 'anonymous';

export interface SessionState {
  status: SessionStatus;
  user: AuthUser | null;
  accessToken: string | null;
  activeOrganizationId: string | null;
}

const ACTIVE_ORG_KEY = 'topflow.activeOrganization';
/** Non-sensitive hint that a refresh cookie probably exists, so anonymous visitors skip a guaranteed 401. */
const SESSION_HINT_KEY = 'topflow.hasSession';
const SERVER_STATE: SessionState = { status: 'loading', user: null, accessToken: null, activeOrganizationId: null };

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

function writeSessionHint(present: boolean): void {
  try {
    if (present) window.localStorage.setItem(SESSION_HINT_KEY, '1');
    else window.localStorage.removeItem(SESSION_HINT_KEY);
  } catch {
    // Storage unavailable — we simply always attempt a refresh.
  }
}

export function applySession(session: AuthSession | null): void {
  writeSessionHint(session !== null);
  if (!session) {
    setState({ status: 'anonymous', user: null, accessToken: null, activeOrganizationId: null });
    return;
  }
  const preferred = readActiveOrganization();
  const memberships = session.user.memberships;
  const activeOrganizationId = memberships.some((m) => m.organizationId === preferred)
    ? preferred
    : (memberships[0]?.organizationId ?? null);
  setState({ status: 'authenticated', user: session.user, accessToken: session.accessToken, activeOrganizationId });
}

export function updateUser(user: AuthUser): void {
  setState({ user });
}

export function setActiveOrganization(organizationId: string): void {
  try {
    window.localStorage.setItem(ACTIVE_ORG_KEY, organizationId);
  } catch {
    // Storage unavailable (private mode) — the choice simply won't persist.
  }
  setState({ activeOrganizationId: organizationId });
}

/** Called once per page load: restore the session only when the browser has signed in before. */
export function bootstrapSession(): void {
  let hinted = true;
  try {
    hinted = window.localStorage.getItem(SESSION_HINT_KEY) === '1';
  } catch {
    hinted = true;
  }
  if (hinted) void refreshSession();
  else applySession(null);
}

let refreshInFlight: Promise<boolean> | null = null;

/** Exchanges the refresh cookie for a new session. Concurrent callers share one request. */
export function refreshSession(): Promise<boolean> {
  refreshInFlight ??= fetch('/api/auth/refresh', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
    .then(async (response) => {
      if (!response.ok) {
        applySession(null);
        return false;
      }
      applySession((await response.json()) as AuthSession);
      return true;
    })
    .catch(() => {
      applySession(null);
      return false;
    })
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

export function useSession(): SessionState & {
  activeMembership: MembershipSummary | null;
} {
  const snapshot = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot, sessionStore.getServerSnapshot);
  const activeMembership =
    snapshot.user?.memberships.find((m) => m.organizationId === snapshot.activeOrganizationId) ?? null;
  return { ...snapshot, activeMembership };
}
