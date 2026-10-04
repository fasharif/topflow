'use client';

import { ErrorCode, ORGANIZATION_HEADER, type ApiErrorBody } from '@topflow/shared';
import { refreshSession, sessionStore } from './session';

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details: ApiErrorBody['details'];
  readonly requestId?: string;

  constructor(status: number, body: Partial<ApiErrorBody>) {
    super(body.message ?? 'Something went wrong. Please try again.');
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.details = body.details;
    this.requestId = body.requestId;
  }

  /** Field-level validation messages keyed by path ("items.0.quantity"). */
  fieldErrors(): Record<string, string> {
    return Object.fromEntries((this.details ?? []).map((detail) => [detail.path, detail.message]));
  }
}

type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, QueryValue>;
  /** Send the active organization (B2B tenant) header. */
  org?: boolean;
  signal?: AbortSignal;
}

function toQueryString(query?: Record<string, QueryValue>): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

/** Same-origin call to /api/*: this app's server adds the session and forwards it to the API. */
function send(path: string, options: RequestOptions): Promise<Response> {
  const { activeOrganizationId } = sessionStore.getSnapshot();
  const headers = new Headers({ accept: 'application/json' });
  if (options.body !== undefined) headers.set('content-type', 'application/json');
  if (options.org) {
    if (!activeOrganizationId) throw new ApiError(400, { message: 'Select an organization first.' });
    headers.set(ORGANIZATION_HEADER, activeOrganizationId);
  }

  return fetch(`/api${path}${toQueryString(options.query)}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    credentials: 'same-origin',
    cache: 'no-store',
    signal: options.signal,
  });
}

/**
 * The message for a 429, with the wait from the `Retry-After` header when the response has one. The
 * header holds a number of seconds (what the API sends) or an HTTP date.
 */
export function rateLimitMessage(retryAfter: string | null, now: number = Date.now()): string {
  const seconds = retryAfterSeconds(retryAfter, now);
  if (seconds === null) return 'Too many requests. Please wait a moment and try again.';
  return `Too many requests. Please wait ${waitText(seconds)} and try again.`;
}

function retryAfterSeconds(retryAfter: string | null, now: number): number | null {
  const value = retryAfter?.trim();
  if (!value) return null;
  const seconds = /^\d+$/.test(value) ? Number(value) : Math.ceil((Date.parse(value) - now) / 1000);
  return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : null;
}

/** Whole minutes are rounded up, so the stated wait is never too short. */
function waitText(seconds: number): string {
  if (seconds < 60) return seconds === 1 ? '1 second' : `${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}

async function toError(response: Response): Promise<ApiError> {
  const body = (await response.json().catch(() => ({}))) as Partial<ApiErrorBody>;
  // The API's rate limiter answers with its framework's default text ("ThrottlerException: Too Many
  // Requests"), which is not written for customers.
  if (response.status === 429) body.message = rateLimitMessage(response.headers.get('retry-after'));
  const error = new ApiError(response.status, body);

  // The session ended (expired, signed out elsewhere or suspended): update the whole UI.
  if (response.status === 401 && sessionStore.getSnapshot().status === 'authenticated') {
    void refreshSession();
  }
  // Back-office actions need a second factor: verify it, then come back to this page.
  if (response.status === 403 && body.code === ErrorCode.MFA_REQUIRED && typeof window !== 'undefined') {
    const here = `${window.location.pathname}${window.location.search}`;
    // A full navigation (not a client transition) so the page reloads with the upgraded session.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/auth/mfa?next=${encodeURIComponent(here)}`);
  }
  return error;
}

/** Typed JSON request against the Top Flow API (through this app's /api handler). */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await send(path, options);
  if (!response.ok) throw await toError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Downloads a binary response (e.g. a quotation PDF) and saves it with the server-provided name. */
export async function downloadFile(path: string, options: RequestOptions = {}, fallbackName = 'download'): Promise<void> {
  const response = await send(path, options);
  if (!response.ok) throw await toError(response);
  const disposition = response.headers.get('content-disposition') ?? '';
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}
