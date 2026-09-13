'use client';

import { ORGANIZATION_HEADER, type ApiErrorBody } from '@topflow/shared';
import { refreshSession, sessionStore } from './session';

export class ApiError extends Error {
  readonly status: number;
  readonly details: ApiErrorBody['details'];
  readonly requestId?: string;

  constructor(status: number, body: Partial<ApiErrorBody>) {
    super(body.message ?? 'Something went wrong. Please try again.');
    this.name = 'ApiError';
    this.status = status;
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

async function send(path: string, options: RequestOptions, allowRetry: boolean): Promise<Response> {
  const { accessToken, activeOrganizationId } = sessionStore.getSnapshot();
  const headers = new Headers({ accept: 'application/json' });
  if (options.body !== undefined) headers.set('content-type', 'application/json');
  if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
  if (options.org) {
    if (!activeOrganizationId) throw new ApiError(400, { message: 'Select an organization first.' });
    headers.set(ORGANIZATION_HEADER, activeOrganizationId);
  }

  const response = await fetch(`/api${path}${toQueryString(options.query)}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    credentials: 'same-origin',
    signal: options.signal,
  });

  // Access tokens are short-lived: refresh once, transparently, then replay the request.
  if (response.status === 401 && allowRetry && accessToken && (await refreshSession())) {
    return send(path, options, false);
  }
  return response;
}

async function toError(response: Response): Promise<ApiError> {
  const body = (await response.json().catch(() => ({}))) as Partial<ApiErrorBody>;
  return new ApiError(response.status, body);
}

/** Typed JSON request against the Top Flow API (proxied through /api). */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await send(path, options, true);
  if (!response.ok) throw await toError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Downloads a binary response (e.g. a quotation PDF) and saves it with the server-provided name. */
export async function downloadFile(path: string, options: RequestOptions = {}, fallbackName = 'download'): Promise<void> {
  const response = await send(path, options, true);
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
