import {
  isAuthRetryableFetchError,
  isAuthWeakPasswordError,
  type AuthChangeEvent,
  type AuthError,
  type Session,
} from '@supabase/supabase-js';
import { ErrorCode, type AuthUser, type LoginInput, type RegisterInput, type SignUpMetadata } from '@topflow/shared';
import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';

import { webUrl } from '@/lib/config';
import { errorMessage, isApiError, request, type ApiError } from '@/lib/http';
import { getSupabase, isSupabaseConfigured, signOutLocally, SUPABASE_NOT_CONFIGURED_MESSAGE } from '@/lib/supabase';

/**
 * Session store (external store + `useSyncExternalStore`).
 *
 * Supabase Auth owns the session. `onAuthStateChange` reports the restored session, sign-in, token
 * refresh and sign-out, and the session is stored encrypted on the device (see `supabase.ts`). For
 * each signed-in identity, the Top Flow account (role, trade memberships, verification) comes from
 * `GET /auth/me`; the API creates it from the Supabase user metadata the first time.
 */

/**
 * - `loading`: restoring the saved session, or loading the account of a new sign-in.
 * - `authenticated`: signed in; `user` is the Top Flow account.
 * - `anonymous`: signed out. `error` can explain why, for example a disabled account.
 * - `unavailable`: signed in with Supabase, but the account could not be loaded (offline, or the API
 *   is down). The session is kept, and loading is retried when the app returns to the foreground,
 *   after a token refresh, or through `retryLoadUser()`.
 */
export type SessionStatus = 'loading' | 'authenticated' | 'anonymous' | 'unavailable';

export interface SessionState {
  readonly status: SessionStatus;
  readonly user: AuthUser | null;
  /** Why the account is `unavailable`, or why the customer was signed out. */
  readonly error: string | null;
}

export type RegisterResult =
  | { readonly status: 'signed-in'; readonly user: AuthUser }
  /** Supabase emailed a confirmation link; the customer can sign in once they have followed it. */
  | { readonly status: 'confirm-email'; readonly email: string };

/** SecureStore key of the refresh token that the retired `/auth/*` endpoints issued. */
const LEGACY_REFRESH_TOKEN_KEY = 'topflow.refresh';

const CONFIRM_EMAIL_REDIRECT = '/auth/confirm?next=/account';
const RESET_PASSWORD_REDIRECT = '/auth/confirm?next=/account/security';

const OFFLINE_MESSAGE = 'Could not reach Top Flow. Check your connection and try again.';

const LOADING: SessionState = { status: 'loading', user: null, error: null };
const ANONYMOUS: SessionState = { status: 'anonymous', user: null, error: null };

let state: SessionState = LOADING;
let bootstrapped = false;
/** Supabase user whose Top Flow account is loaded or being loaded. */
let accountUserId: string | null = null;
let accountLoad: Promise<void> | null = null;
/** Bumped whenever the signed-in identity changes, so a slow load cannot apply to a replaced session. */
let generation = 0;
/** Set while signing out, so a token refresh reported meanwhile cannot bring the old session back. */
let signingOut = false;

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

// ─── Following Supabase Auth ─────────────────────────────────────────────────

/** Restores the saved session and keeps the store in step with Supabase Auth. Call once at startup. */
export function bootstrapSession(): void {
  if (bootstrapped) return;
  bootstrapped = true;
  void removeLegacyRefreshToken();

  if (!isSupabaseConfigured) {
    // Browsing and quote requests still work; the sign-in forms repeat this message.
    console.error(SUPABASE_NOT_CONFIGURED_MESSAGE);
    setState(ANONYMOUS);
    return;
  }

  getSupabase().auth.onAuthStateChange((event, session) => {
    const duringSignOut = signingOut;
    // Supabase notifies listeners while it holds its auth lock: react after it has returned.
    setTimeout(() => void handleAuthEvent(event, session, duringSignOut), 0);
  });
  AppState.addEventListener('change', handleAppStateChange);
}

async function handleAuthEvent(event: AuthChangeEvent, session: Session | null, duringSignOut: boolean): Promise<void> {
  if (!session) {
    // Nothing saved at startup (INITIAL_SESSION), or signed out.
    forgetAccount();
    // Keep the explanation of an earlier sign-out, if one is shown.
    if (state.status !== 'anonymous') setState(ANONYMOUS);
    return;
  }
  if (duringSignOut) return;

  const sameUser = session.user.id === accountUserId;
  // Token refreshes need no reload, unless the account could not be loaded before.
  if (sameUser && event !== 'USER_UPDATED' && (state.status === 'authenticated' || accountLoad)) return;
  await loadAccount(session.user.id);
}

function handleAppStateChange(next: AppStateStatus): void {
  if (next === 'active' && state.status === 'unavailable') void retryLoadUser();
}

function forgetAccount(): void {
  generation += 1;
  accountUserId = null;
  accountLoad = null;
}

/**
 * Loads the Top Flow account of a signed-in Supabase user. Calls for the same user share one request.
 * A new identity shows `loading`; a reload for the same user keeps the current state until it ends.
 */
function loadAccount(userId: string): Promise<void> {
  if (accountLoad && accountUserId === userId) return accountLoad;
  if (accountUserId !== userId) {
    forgetAccount();
    accountUserId = userId;
    setState(LOADING);
  }
  const load = fetchAccount(generation);
  accountLoad = load;
  void load.finally(() => {
    if (accountLoad === load) accountLoad = null;
  });
  return load;
}

async function fetchAccount(startedAt: number): Promise<void> {
  try {
    const user = await request<AuthUser>('/auth/me', { auth: true });
    if (startedAt === generation) setState({ status: 'authenticated', user, error: null });
  } catch (error) {
    if (startedAt !== generation) return;
    if (isApiError(error, 401)) {
      // The API rejected the session and http.ts has signed out on this device.
      forgetAccount();
      setState({ status: 'anonymous', user: null, error: errorMessage(error) });
    } else if (isApiError(error, 403) || isApiError(error, 409)) {
      // The account cannot be used, for example it was disabled: end the session.
      forgetAccount();
      setState({ status: 'anonymous', user: null, error: accountProblemMessage(error) });
      await endSupabaseSession(() => signOutLocally());
    } else {
      setState({ status: 'unavailable', user: null, error: errorMessage(error) });
    }
  }
}

function accountProblemMessage(error: ApiError): string {
  if (error.code === ErrorCode.ACCOUNT_DISABLED) {
    return 'Your Top Flow account has been disabled. Please contact us for help.';
  }
  if (error.code === ErrorCode.ACCOUNT_CONFLICT) {
    return 'This email address is linked to a different Top Flow account. Please contact us for help.';
  }
  return error.message;
}

async function endSupabaseSession(task: () => Promise<void>): Promise<void> {
  signingOut = true;
  try {
    await task();
  } catch {
    // Best effort: the store already shows the customer as signed out.
  } finally {
    signingOut = false;
  }
}

/** Installs from before Supabase Auth kept a refresh token for the retired `/auth/refresh` endpoint. */
async function removeLegacyRefreshToken(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    if (await SecureStore.getItemAsync(LEGACY_REFRESH_TOKEN_KEY)) {
      await SecureStore.deleteItemAsync(LEGACY_REFRESH_TOKEN_KEY);
    }
  } catch {
    // Unreadable keychain: there is nothing we can clean up.
  }
}

// ─── Actions ─────────────────────────────────────────────────────────────────

/** A Supabase Auth failure, with a message written for the sign-in and sign-up forms. */
export class AuthFormError extends Error {
  readonly code: string | null;

  constructor(error: AuthError) {
    super(authErrorMessage(error));
    this.name = 'AuthFormError';
    this.code = error.code ?? null;
  }
}

/** Sign-in was refused because the email address has not been confirmed yet. */
export function isEmailNotConfirmed(error: unknown): boolean {
  return error instanceof AuthFormError && error.code === 'email_not_confirmed';
}

function authErrorMessage(error: AuthError): string {
  if (isAuthRetryableFetchError(error)) return OFFLINE_MESSAGE;
  if (isAuthWeakPasswordError(error)) {
    return 'This password is too weak or has appeared in a data breach. Please choose a different one.';
  }
  switch (error.code) {
    case 'invalid_credentials':
      return 'The email address or password is incorrect.';
    case 'email_not_confirmed':
      return 'Please confirm your email address first, using the link we emailed you.';
    case 'user_already_exists':
      return 'An account with this email address already exists. Sign in instead.';
    case 'email_address_invalid':
      return 'Enter a valid email address.';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'Too many attempts. Please wait a few minutes and try again.';
    case 'signup_disabled':
    case 'email_provider_disabled':
      return 'New accounts cannot be created right now. Please try again later.';
    case 'user_banned':
      return 'This account cannot sign in. Please contact Top Flow for help.';
    default:
      return error.message || 'Something went wrong. Please try again.';
  }
}

/** Signs in with Supabase Auth and loads the Top Flow account. Resolves once fully signed in. */
export async function signIn({ email, password }: LoginInput): Promise<AuthUser> {
  const { data, error } = await getSupabase().auth.signInWithPassword({ email, password });
  if (error) throw new AuthFormError(error);
  return completeSignIn(data.session);
}

/**
 * Creates the Supabase identity. The full name and phone number travel as user metadata, from which
 * the API creates the Top Flow account on first use.
 */
export async function register({ fullName, email, password, phoneNumber }: RegisterInput): Promise<RegisterResult> {
  const metadata: SignUpMetadata = { full_name: fullName, phone_number: phoneNumber };
  const { data, error } = await getSupabase().auth.signUp({
    email,
    password,
    options: { data: metadata, emailRedirectTo: webUrl(CONFIRM_EMAIL_REDIRECT) },
  });
  if (error) throw new AuthFormError(error);
  // With email confirmation on, there is no session until the link is followed. Supabase answers the
  // same way for an address that is already registered, so nothing is revealed about it.
  if (!data.session) return { status: 'confirm-email', email };
  return { status: 'signed-in', user: await completeSignIn(data.session) };
}

async function completeSignIn(session: Session): Promise<AuthUser> {
  await loadAccount(session.user.id);
  if (accountUserId === session.user.id && state.status === 'authenticated' && state.user) {
    return state.user;
  }
  // The account could not be loaded: do not leave a half-signed-in session on the device.
  const message = state.error ?? 'We could not load your account. Please try again.';
  if (state.status !== 'anonymous') {
    forgetAccount();
    setState(ANONYMOUS);
    await endSupabaseSession(() => signOutLocally());
  }
  throw new Error(message);
}

/** Sends the sign-up confirmation email again. */
export async function resendConfirmationEmail(email: string): Promise<void> {
  const { error } = await getSupabase().auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: webUrl(CONFIRM_EMAIL_REDIRECT) },
  });
  if (error) throw new AuthFormError(error);
}

/**
 * Emails a link to choose a new password on the web app. It resolves the same way whether or not the
 * account exists: only a failure that says nothing about the account (no connection) is reported.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
    redirectTo: webUrl(RESET_PASSWORD_REDIRECT),
  });
  if (error && isAuthRetryableFetchError(error)) throw new AuthFormError(error);
}

/** Signs out on this device straight away, then asks Supabase to end the session (best effort). */
export async function signOut(): Promise<void> {
  forgetAccount();
  setState(ANONYMOUS);
  if (!isSupabaseConfigured) return;
  await endSupabaseSession(async () => {
    // Local scope: signing out of the app must not end the user's sessions on the website.
    const { error } = await getSupabase().auth.signOut({ scope: 'local' });
    // Offline, Supabase can keep the session: make sure it is gone from this device.
    if (error) await signOutLocally();
  });
}

/** Loads the account again while it is `unavailable`, for example from a "Try again" button. */
export async function retryLoadUser(): Promise<void> {
  if (!isSupabaseConfigured || state.status !== 'unavailable') return;
  const { data, error } = await getSupabase().auth.getSession();
  if (data.session) {
    await loadAccount(data.session.user.id);
  } else if (isAuthRetryableFetchError(error)) {
    setState({ status: 'unavailable', user: null, error: OFFLINE_MESSAGE });
  } else {
    forgetAccount();
    setState(ANONYMOUS);
  }
}
