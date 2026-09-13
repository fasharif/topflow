import type { ApiErrorBody } from '@topflow/shared';

/**
 * Low-level HTTP transport for the Top Flow API: URL building, JSON encoding, timeouts and
 * error normalisation. It knows nothing about sessions — see `api.ts` for authenticated calls.
 */

// Must be referenced statically (dot notation) so Expo inlines it at build time.
const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');

const REQUEST_TIMEOUT_MS = 20_000;

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
  method?: HttpMethod;
  /** Serialised as JSON. */
  body?: unknown;
  query?: QueryParams;
  headers?: Record<string, string>;
  accessToken?: string | null;
  signal?: AbortSignal;
}

type ErrorDetail = NonNullable<ApiErrorBody['details']>[number];

/** A failed API call. `status` is the HTTP status, or 0 when the server could not be reached. */
export class ApiError extends Error {
  readonly status: number;
  readonly details: ErrorDetail[];

  constructor(status: number, message: string, details: ErrorDetail[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
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

  const { method = 'GET', body, query, accessToken, signal } = options;
  const headers: Record<string, string> = { accept: 'application/json', ...options.headers };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;

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
      controller.signal.aborted
        ? 'The request timed out. Check your connection and try again.'
        : 'Could not reach Top Flow. Check your connection and try again.',
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

function toApiError(status: number, data: unknown): ApiError {
  if (isRecord(data)) {
    const raw = data.message;
    const first: unknown = Array.isArray(raw) ? (raw as unknown[])[0] : raw;
    const details = Array.isArray(data.details) ? (data.details as unknown[]).filter(isErrorDetail) : [];
    if (typeof first === 'string' && first.trim()) {
      return new ApiError(status, first, details);
    }
  }
  return new ApiError(status, fallbackMessage(status));
}

function fallbackMessage(status: number): string {
  if (status === 400) return 'Please check the details and try again.';
  if (status === 401) return 'Please sign in to continue.';
  if (status === 403) return 'You do not have access to this.';
  if (status === 404) return 'We could not find what you were looking for.';
  if (status === 429) return 'Too many attempts. Please wait a moment and try again.';
  if (status >= 500) return 'Top Flow is having trouble right now. Please try again shortly.';
  return `The request failed (${status}).`;
}
