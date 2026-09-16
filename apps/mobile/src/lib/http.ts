import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import type { ApiErrorBody } from '@topflow/shared';

import { API_URL } from '@/lib/config';
import { getSupabase, isSupabaseConfigured, signOutLocally, SUPABASE_NOT_CONFIGURED_MESSAGE } from '@/lib/supabase';

/**
 * HTTP client for the Top Flow API: URL building, JSON encoding, timeouts, error normalisation and
 * authentication.
 *
 * Authenticated calls send `Authorization: Bearer <Supabase access token>`. The token comes from
 * `supabase.auth.getSession()`, which refreshes it when it is about to expire. When the API still
 * rejects it (401), the session is no longer valid and the app signs out on this device.
 */

const REQUEST_TIMEOUT_MS = 20_000;

export const SIGN_IN_REQUIRED_MESSAGE = 'Please sign in to continue.';
export const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please sign in again.';
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

type ErrorDetail = NonNullable<ApiErrorBody['details']>[number];

/** A failed API call. `status` is the HTTP status, or 0 when the server could not be reached. */
export class ApiError extends Error {
  readonly status: number;
  /** Machine-readable reason from the API (`ErrorCode` in `@topflow/shared`), when it sent one. */
  readonly code: string | null;
  readonly details: ErrorDetail[];

  constructor(status: number, message: string, options: { code?: string | null; details?: ErrorDetail[] } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = options.code ?? null;
    this.details = options.details ?? [];
  }
}

export function isApiError(error: unknown, status?: number): error is ApiError {
  return error instanceof ApiError && (status === undefined || error.status === status);
}

/** A user-presentable message for any thrown value. */
export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isErrorDetail(value: unknown): value is ErrorDetail {
  return isRecord(value) && typeof value.path === 'string' && typeof value.message === 'string';
}

/** Normalises the API's `ApiErrorBody` (`{ statusCode, message, code?, details? }`). */
function toApiError(status: number, data: unknown): ApiError {
  if (!isRecord(data)) return new ApiError(status, fallbackMessage(status));
  const raw = data.message;
  const first: unknown = Array.isArray(raw) ? (raw as unknown[])[0] : raw;
  const code = typeof data.code === 'string' && data.code ? data.code : null;
  const details = Array.isArray(data.details) ? (data.details as unknown[]).filter(isErrorDetail) : [];
  const message = typeof first === 'string' && first.trim() ? first : fallbackMessage(status);
  return new ApiError(status, message, { code, details });
}

function fallbackMessage(status: number): string {
  if (status === 400) return 'Please check the details and try again.';
  if (status === 401) return SIGN_IN_REQUIRED_MESSAGE;
  if (status === 403) return 'You do not have access to this.';
  if (status === 404) return 'We could not find what you were looking for.';
  if (status === 429) return 'Too many attempts. Please wait a moment and try again.';
  if (status >= 500) return 'Top Flow is having trouble right now. Please try again shortly.';
  return `The request failed (${status}).`;
}
