import type { Instrumentation } from 'next';

type RequestErrorArgs = Parameters<Instrumentation.onRequestError>;
export type ErrorRequest = RequestErrorArgs[1];
export type ErrorContext = RequestErrorArgs[2];

/** The part of @sentry/nextjs the web server uses (replaced by a fake in tests). */
export interface ErrorReportingSdk {
  init(options: WebSentryOptions): unknown;
  captureRequestError(error: unknown, request: ErrorRequest, context: ErrorContext): void;
}

export interface WebSentryOptions {
  dsn: string;
  environment: string;
  release?: string;
  tracesSampleRate: number;
  /** Never send cookies, IP addresses or user details to Sentry. */
  sendDefaultPii: false;
  beforeSend: typeof scrubEvent;
  beforeBreadcrumb: typeof scrubBreadcrumb;
}

/** The part of a Sentry event that can carry request details. */
export interface ScrubbableEvent {
  request?: { url?: string; headers?: Record<string, string>; cookies?: unknown; query_string?: unknown; data?: unknown };
}

/** The part of a Sentry breadcrumb that can carry personal data. */
export interface ScrubbableBreadcrumb {
  category?: string;
  message?: string;
  data?: Record<string, unknown>;
}

type Env = Record<string, string | undefined>;

/** Headers that carry sessions, secrets or shoppers' addresses: never sent to Sentry. */
const PRIVATE_HEADERS = new Set(['authorization', 'cookie', 'x-topflow-internal-auth', 'x-topflow-client-ip', 'x-forwarded-for', 'x-real-ip']);

/**
 * Last filter before an event leaves the server: whatever the SDK collected about the request,
 * credentials, client addresses, query strings and bodies are removed.
 */
export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
  const request = event.request;
  if (request) {
    for (const name of Object.keys(request.headers ?? {})) {
      if (PRIVATE_HEADERS.has(name.toLowerCase())) delete request.headers?.[name];
    }
    delete request.cookies;
    delete request.query_string;
    delete request.data;
    if (request.url) request.url = request.url.split('?')[0];
  }
  return event;
}

/**
 * Filter for the breadcrumbs sent with an event. The SDK records the server's outgoing fetch and
 * HTTP calls (to the API and Supabase, for example) with their URL and query string, and console
 * output, which can quote anything the server logged. URLs keep only their origin and path;
 * console breadcrumbs are dropped.
 */
export function scrubBreadcrumb<T extends ScrubbableBreadcrumb>(breadcrumb: T): T | null {
  if (breadcrumb.category === 'console') return null;
  const data = breadcrumb.data;
  if (data) {
    if (typeof data.url === 'string') data.url = data.url.split(/[?#]/)[0];
    delete data['http.query'];
    delete data['http.fragment'];
  }
  return breadcrumb;
}

/**
 * Sentry options for the web server, read at runtime so one image serves every environment.
 * Returns null (reporting off) when SENTRY_DSN is unset or empty.
 */
export function sentryOptions(env: Env = process.env): WebSentryOptions | null {
  const dsn = env.SENTRY_DSN?.trim();
  if (!dsn) return null;
  let url: URL;
  try {
    url = new URL(dsn);
  } catch {
    throw new Error('SENTRY_DSN must be the URL of a Sentry project (https://<key>@<host>/<project>).');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('SENTRY_DSN must be an http(s) URL.');
  }
  const rate = Number(env.SENTRY_TRACES_SAMPLE_RATE?.trim() || '0');
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
    throw new Error('SENTRY_TRACES_SAMPLE_RATE must be a number between 0 and 1.');
  }
  return {
    dsn,
    environment: env.SENTRY_ENVIRONMENT?.trim() || env.NODE_ENV || 'development',
    release: env.APP_VERSION?.trim() || undefined,
    tracesSampleRate: rate,
    sendDefaultPii: false,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  };
}

const loadSentry = async (): Promise<ErrorReportingSdk> => (await import('@sentry/nextjs')) as unknown as ErrorReportingSdk;

let reporter: ErrorReportingSdk | null = null;

/**
 * Starts Sentry on the Node.js server when SENTRY_DSN is set. Without it the SDK is never
 * loaded, so reporting costs nothing. Called from instrumentation.ts `register()`.
 */
export async function startErrorReporting(env: Env = process.env, load: () => Promise<ErrorReportingSdk> = loadSentry): Promise<boolean> {
  const options = sentryOptions(env);
  if (!options) {
    reporter = null;
    return false;
  }
  const sdk = await load();
  sdk.init(options);
  reporter = sdk;
  return true;
}

/** The request as Sentry may see it: no query string and no private headers. */
export function redactRequest(request: ErrorRequest): ErrorRequest {
  const headers: ErrorRequest['headers'] = {};
  for (const [name, value] of Object.entries(request.headers)) {
    if (!PRIVATE_HEADERS.has(name.toLowerCase())) headers[name] = value;
  }
  return { ...request, path: request.path.split('?')[0], headers };
}

/** Reports a server-side error (render, route handler, Server Action, proxy); a no-op when off. */
export function reportRequestError(error: unknown, request: ErrorRequest, context: ErrorContext): void {
  reporter?.captureRequestError(error, redactRequest(request), context);
}
