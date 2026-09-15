import type { AuthSession, AuthUser, LoginInput, RegisterInput } from '@topflow/shared';
import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';

import { isApiError, request } from '@/lib/http';

/**
 * Session store (external store + `useSyncExternalStore`).
 *
 * - The access token lives in memory only.
 * - The rotating refresh token is persisted in the OS keychain / keystore via SecureStore on
 *   iOS and Android. SecureStore does not support web, so there it stays in memory and the
 *   session ends when the tab closes.
 */

export type SessionStatus = 'loading' | 'authenticated' | 'anonymous';

export interface SessionState {
  readonly status: SessionStatus;
  readonly user: AuthUser | null;
  readonly accessToken: string | null;
}

export type RefreshOutcome = 'refreshed' | 'expired';

const REFRESH_TOKEN_KEY = 'topflow.refresh';
/** Asks the API to return the refresh token in the response body instead of a browser cookie. */
const MOBILE_CLIENT_HEADERS = { 'x-client-platform': 'mobile' };
const canPersistToken = Platform.OS !== 'web';

const ANONYMOUS: SessionState = { status: 'anonymous', user: null, accessToken: null };

let state: SessionState = { status: 'loading', user: null, accessToken: null };
let refreshToken: string | null = null;
let refreshInFlight: Promise<RefreshOutcome> | null = null;
let bootstrapPromise: Promise<void> | null = null;
/** Bumped by explicit sign-in / sign-out so a slow refresh cannot resurrect a replaced session. */
let generation = 0;
/** Set when restoring failed for a transient reason (offline); retried when the app is foregrounded. */
let restorePending = false;

const listeners = new Set<() => void>();

function setState(next: SessionState): void {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): SessionState {
  return state;
}

export function useSession(): SessionState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function getAccessToken(): string | null {
  return state.accessToken;
}

// ─── Secure storage ──────────────────────────────────────────────────────────

async function readStoredRefreshToken(): Promise<string | null> {
  if (!canPersistToken) return null;
  try {
    return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  } catch {
    // The keychain can be unreadable (e.g. after restoring a device backup): start signed out.
    return null;
  }
}

async function storeRefreshToken(token: string): Promise<void> {
  if (!canPersistToken) return;
  try {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } catch {
    // The session keeps working for this launch; the user signs in again next time.
  }
}

async function deleteStoredRefreshToken(): Promise<void> {
  if (!canPersistToken) return;
  try {
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  } catch {
    // Nothing stored.
  }
}

// ─── Transitions ─────────────────────────────────────────────────────────────

async function applySession(session: AuthSession): Promise<void> {
  if (session.refreshToken) {
    refreshToken = session.refreshToken;
    // Persist the rotated token before exposing the session: the previous one is now revoked.
    await storeRefreshToken(session.refreshToken);
  }
  setState({ status: 'authenticated', user: session.user, accessToken: session.accessToken });
}

async function clearSession(): Promise<void> {
  refreshToken = null;
  setState(ANONYMOUS);
  await deleteStoredRefreshToken();
}

/**
 * Exchanges the refresh token for a new session. Concurrent callers share one in-flight request,
 * so a burst of 401s triggers a single rotation. Resolves `'expired'` (and signs out) when the
 * API rejects the token; rejects with the underlying error when the API cannot be reached, in
 * which case the stored token is kept for a later attempt.
 */
export function refreshSession(): Promise<RefreshOutcome> {
  if (!refreshInFlight) {
    refreshInFlight = runRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function runRefresh(): Promise<RefreshOutcome> {
  const startedAt = generation;
  const token = refreshToken ?? (await readStoredRefreshToken());
  if (!token) {
    if (startedAt === generation && state.status !== 'anonymous') await clearSession();
    return 'expired';
  }

  try {
    const session = await request<AuthSession>('/auth/refresh', {
      method: 'POST',
      body: { refreshToken: token },
      headers: MOBILE_CLIENT_HEADERS,
    });
    if (startedAt !== generation) {
      return state.status === 'authenticated' ? 'refreshed' : 'expired';
    }
    await applySession(session);
    return 'refreshed';
  } catch (error) {
    if (isApiError(error, 400) || isApiError(error, 401) || isApiError(error, 403)) {
      if (startedAt === generation) await clearSession();
      return 'expired';
    }
    throw error;
  }
}

/** Restores the previous session on app start (stored refresh token → new access token). */
export function bootstrapSession(): Promise<void> {
  if (!bootstrapPromise) {
    AppState.addEventListener('change', handleAppStateChange);
    bootstrapPromise = restoreSession();
  }
  return bootstrapPromise;
}

async function restoreSession(): Promise<void> {
  const stored = await readStoredRefreshToken();
  if (!stored) {
    if (state.status === 'loading') setState(ANONYMOUS);
    return;
  }
  refreshToken ??= stored;
  try {
    await refreshSession();
  } catch {
    // Offline or the API is unreachable: continue signed out for now, keep the stored token and
    // try again when the app returns to the foreground.
    restorePending = true;
    if (state.status === 'loading') setState(ANONYMOUS);
  }
}

function handleAppStateChange(next: AppStateStatus): void {
  if (next !== 'active' || !restorePending || state.status !== 'anonymous' || !refreshToken) return;
  restorePending = false;
  refreshSession().catch(() => {
    restorePending = true;
  });
}

export async function signIn(input: LoginInput): Promise<AuthUser> {
  const session = await request<AuthSession>('/auth/login', {
    method: 'POST',
    body: input,
    headers: MOBILE_CLIENT_HEADERS,
  });
  generation += 1;
  restorePending = false;
  await applySession(session);
  return session.user;
}

export async function register(input: RegisterInput): Promise<AuthUser> {
  const session = await request<AuthSession>('/auth/register', {
    method: 'POST',
    body: input,
    headers: MOBILE_CLIENT_HEADERS,
  });
  generation += 1;
  restorePending = false;
  await applySession(session);
  return session.user;
}

/** Signs out locally straight away, then revokes the refresh token on the server (best effort). */
export async function signOut(): Promise<void> {
  const token = refreshToken ?? (await readStoredRefreshToken());
  generation += 1;
  restorePending = false;
  await clearSession();
  if (!token) return;
  try {
    await request<void>('/auth/logout', {
      method: 'POST',
      body: { refreshToken: token },
      headers: MOBILE_CLIENT_HEADERS,
    });
  } catch {
    // The token is already gone from this device and expires on the server.
  }
}
