import type { ApiErrorBody } from '@topflow/shared';

/**
 * The error type of API calls, and how the API's error body becomes one. Kept free of React Native
 * so it can be unit tested with Node (api-error.spec.ts). `http.ts` uses it and re-exports it.
 */

export const SIGN_IN_REQUIRED_MESSAGE = 'Please sign in to continue.';
export const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please sign in again.';

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isErrorDetail(value: unknown): value is ErrorDetail {
  return isRecord(value) && typeof value.path === 'string' && typeof value.message === 'string';
}

/**
 * Normalises the API's `ApiErrorBody` (`{ statusCode, message, code?, details? }`). `retryAfter` is
 * the response's `Retry-After` header, used for the message of a 429.
 */
export function toApiError(status: number, data: unknown, retryAfter: string | null = null): ApiError {
  if (!isRecord(data)) return new ApiError(status, fallbackMessage(status, retryAfter));
  const raw = data.message;
  const first: unknown = Array.isArray(raw) ? (raw as unknown[])[0] : raw;
  const code = typeof data.code === 'string' && data.code ? data.code : null;
  const details = Array.isArray(data.details) ? (data.details as unknown[]).filter(isErrorDetail) : [];
  // The rate limiter's body carries its framework's default text ("ThrottlerException: Too Many
  // Requests"), which is not written for customers: a 429 always gets the app's own message.
  const message = status !== 429 && typeof first === 'string' && first.trim() ? first : fallbackMessage(status, retryAfter);
  return new ApiError(status, message, { code, details });
}

function fallbackMessage(status: number, retryAfter: string | null): string {
  if (status === 400) return 'Please check the details and try again.';
  if (status === 401) return SIGN_IN_REQUIRED_MESSAGE;
  if (status === 403) return 'You do not have access to this.';
  if (status === 404) return 'We could not find what you were looking for.';
  if (status === 429) return rateLimitMessage(retryAfter);
  if (status >= 500) return 'Top Flow is having trouble right now. Please try again shortly.';
  return `The request failed (${status}).`;
}

/**
 * The message for a 429, with the wait from the `Retry-After` header when the response carried one.
 * The header holds a number of seconds (what the API sends) or an HTTP date.
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
