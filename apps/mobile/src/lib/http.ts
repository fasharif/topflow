import { isAuthRetryableFetchError } from '@supabase/supabase-js';

import { ApiError, isApiError, SESSION_EXPIRED_MESSAGE, SIGN_IN_REQUIRED_MESSAGE, toApiError } from '@/lib/api-error';
import { API_URL } from '@/lib/config';
import { getSupabase, isSupabaseConfigured, signOutLocally, SUPABASE_NOT_CONFIGURED_MESSAGE } from '@/lib/supabase';

/**
 * HTTP client for the Top Flow API: URL building, JSON encoding, timeouts, error normalisation and
 * authentication.
 *
 * Authenticated calls send `Authorization: Bearer <Supabase access token>`. The token comes from
 * `supabase.auth.getSession()`, which refreshes it when it is about to expire. When the API still
 * rejects it (401), the session is no longer valid and the app signs out on this device.
 *
 * The error type and the normalisation of the API's error body live in `api-error.ts`.
 */

export { ApiError, errorMessage, isApiError, SESSION_EXPIRED_MESSAGE, SIGN_IN_REQUIRED_MESSAGE } from '@/lib/api-error';

const REQUEST_TIMEOUT_MS = 20_000;

const OFFLINE_MESSAGE = 'Could not reach Top Flow. Check your connection and try again.';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

/**
 * - `true`: the endpoint needs a signed-in customer. The access token is sent, and the call fails
 *   with a 401 `ApiError` when there is no session.
 * - `'optional'`: a public endpoint that also recognises signed-in customers (for example quote
 *   requests). The token is sent when there is a session.
 * - `false`: the token is never sent.
 */
export type AuthMode = boolean | 'optional';

export interface RequestOptions {
  method?: HttpMethod;
  /** Serialised as JSON. */
  body?: unknown;
  query?: QueryParams;
  headers?: Record<string, string>;
  /** Defaults to `false`. */
  auth?: AuthMode;
  signal?: AbortSignal;
}

type TransportOptions = Omit<RequestOptions, 'auth'>;

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!API_URL) {
    throw new ApiError(0, 'The app is not configured: set EXPO_PUBLIC_API_URL and restart Expo.');
  }

  const { auth = false, ...transport } = options;
  if (!auth) return send<T>(path, transport, null);

  const token = await accessToken(auth === true);
  try {
    return await send<T>(path, transport, token);
  } catch (error) {
    if (!token || !isApiError(error, 401)) throw error;
    return retryUnauthorized<T>(path, transport, auth, token, error);
  }
}

/**
 * The current access token (refreshed by Supabase when it is about to expire), or `null` when
 * signed out and `required` is false.
 */
async function accessToken(required: boolean): Promise<string | null> {
  if (!isSupabaseConfigured) {
    if (required) throw new ApiError(0, SUPABASE_NOT_CONFIGURED_MESSAGE);
    return null;
  }
  const { data, error } = await getSupabase().auth.getSession();
  if (data.session) return data.session.access_token;
  if (!required) return null;
  // Offline while the token needed refreshing: Supabase keeps the session for a later attempt.
  if (isAuthRetryableFetchError(error)) throw new ApiError(0, OFFLINE_MESSAGE);
  throw new ApiError(401, SIGN_IN_REQUIRED_MESSAGE);
}

/**
 * The API rejected `rejectedToken`. A 401 means the request was not processed, so it is safe to
 * replay once when the session was refreshed while it was in flight. Otherwise the session is no
 * longer valid: sign out on this device, then retry as a visitor (`'optional'`) or report it.
 */
async function retryUnauthorized<T>(
  path: string,
  transport: TransportOptions,
  auth: AuthMode,
  rejectedToken: string,
  rejection: ApiError,
): Promise<T> {
  const current = await accessToken(false).catch(() => null);
  if (current && current !== rejectedToken) {
    try {
      return await send<T>(path, transport, current);
    } catch (error) {
      if (!isApiError(error, 401)) throw error;
    }
  }
  if (current) await signOutLocally().catch(() => undefined);
  if (auth === 'optional') return send<T>(path, transport, null);
  throw new ApiError(401, SESSION_EXPIRED_MESSAGE, { code: rejection.code, details: rejection.details });
}

async function send<T>(path: string, options: TransportOptions, token: string | null): Promise<T> {
  const { method = 'GET', body, query, signal } = options;
  const headers: Record<string, string> = { accept: 'application/json', ...options.headers };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  signal?.addEventListener('abort', abortFromCaller);

  let status: number;
  let ok: boolean;
  let text: string;
  try {
    const response = await fetch(`${API_URL}${path}${buildQuery(query)}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    status = response.status;
    ok = response.ok;
    text = await response.text();
  } catch (cause) {
    if (signal?.aborted) throw cause;
    throw new ApiError(
      0,
      controller.signal.aborted ? 'The request timed out. Check your connection and try again.' : OFFLINE_MESSAGE,
    );
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abortFromCaller);
  }

  const data = parseJson(text);
  if (!ok) throw toApiError(status, data);
  return data as T;
}

function buildQuery(query: QueryParams | undefined): string {
  if (!query) return '';
  const parts: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

function parseJson(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
