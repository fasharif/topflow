import type { Instrumentation } from 'next';
// Type-only import: erased at compile time, so the SDK is loaded only when SENTRY_DSN is set.
import type { NodeOptions } from '@sentry/nextjs';

type RequestErrorArgs = Parameters<Instrumentation.onRequestError>;
export type ErrorRequest = RequestErrorArgs[1];
export type ErrorContext = RequestErrorArgs[2];

/** The part of @sentry/nextjs the web server uses (replaced by a fake in tests). */
export interface ErrorReportingSdk {
  init(options: WebSentryOptions): unknown;
  captureRequestError(error: unknown, request: ErrorRequest, context: ErrorContext): void;
}

type DataCollection = NonNullable<NodeOptions['dataCollection']>;

/** The options the web server passes to Sentry.init; checked against the SDK's own option type. */
export interface WebSentryOptions {
  dsn: string;
  environment: string;
  release?: string;
  tracesSampleRate: number;
  /**
   * Pinned so SENTRY_TRACE_LIFECYCLE cannot switch to the 'static' lifecycle, in which the SDK
   * would skip `beforeSendSpan` and send spans unfiltered.
   */
  traceLifecycle: 'stream';
  dataCollection: DataCollection;
  beforeSend: typeof scrubEvent;
  beforeSendSpan: typeof scrubSpan;
  beforeBreadcrumb: typeof scrubBreadcrumb;
}

/** The part of a Sentry error event that can carry request or user details. */
export interface ScrubbableEvent {
  request?: { url?: string; headers?: Record<string, string>; cookies?: unknown; query_string?: unknown; data?: unknown };
  user?: unknown;
  contexts?: { trace?: { data?: Record<string, unknown> } };
}

/** The part of a streamed span (Sentry 11's default trace lifecycle) that can carry personal data. */
export interface ScrubbableSpan {
  name: string;
  attributes?: Record<string, unknown>;
}

/** The part of a Sentry breadcrumb that can carry personal data. */
export interface ScrubbableBreadcrumb {
  category?: string;
  message?: string;
  data?: Record<string, unknown>;
}

type Env = Record<string, string | undefined>;

/**
 * The shape the SDK accepts: https://<public key>@<host>/<numeric project id>. Anything else the
 * SDK would ignore with only a console message, leaving error reporting silently off.
 */
export const SENTRY_DSN_PATTERN = /^https?:\/\/\w+(:\w*)?@(\[[:.%\w]+\]|[\w.-]+)(:\d+)?\/([^\s?#]+\/)?\d+$/;

/** Request headers worth keeping for debugging; every other header is dropped. */
const SAFE_HEADERS = ['accept', 'accept-encoding', 'accept-language', 'content-length', 'content-type', 'host', 'user-agent', 'x-request-id'];
const SAFE_HEADER_SET = new Set(SAFE_HEADERS);

/**
 * What the SDK may collect in the first place. Sentry 11 collects cookies, headers, bodies, query
 * strings and client addresses by default and no longer has the `sendDefaultPii` switch, so every
 * category is turned off here explicitly. The scrubbers below remove anything that still gets
 * through (Next.js's own OpenTelemetry spans, for example).
 */
export const DATA_COLLECTION: DataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: { request: { allow: SAFE_HEADERS }, response: false },
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
};

/** Span, trace and breadcrumb attributes that carry query strings, addresses or user details. */
const PRIVATE_ATTRIBUTES = new Set([
  'http.query',
  'url.query',
  'http.fragment',
  'url.fragment',
  'client.address',
  'http.client_ip',
  'net.peer.ip',
  'net.sock.peer.addr',
  'network.peer.address',
  'user.email',
  'user.ip_address',
  'user.name',
]);

const HEADER_ATTRIBUTE = /^http\.(request|response)\.header\.(.+)$/;
/** Request and response bodies (`http.request.body.data`, for example), but not their sizes. */
const BODY_ATTRIBUTE = /^http\.(request|response)\.body(\.(?!size$)|$)/;
/** Attributes that repeat a span name. */
const NAME_ATTRIBUTES = new Set(['sentry.segment.name']);
/** An absolute URL or a path that still has a query string or fragment. */
const URL_WITH_QUERY = /^(https?:\/\/|\/)[^\s?#]*[?#]/;

const withoutQuery = (value: string): string => value.split(/[?#]/)[0];
/** A span name such as `GET /auth/confirm?token_hash=...` without its query string. */
const nameWithoutQuery = (name: string): string => name.replace(/[?#]\S*/g, '');

/**
 * Removes query strings, fragments, bodies, client addresses, user details and private headers
 * from a set of attributes (span attributes, trace data or breadcrumb data), in place.
 */
export function scrubAttributes(attributes: Record<string, unknown> | undefined): void {
  if (!attributes) return;
  for (const [key, value] of Object.entries(attributes)) {
    const header = HEADER_ATTRIBUTE.exec(key);
    if (PRIVATE_ATTRIBUTES.has(key) || BODY_ATTRIBUTE.test(key) || (header && (header[1] === 'response' || !SAFE_HEADER_SET.has(header[2])))) {
      delete attributes[key];
    } else if (typeof value === 'string' && NAME_ATTRIBUTES.has(key)) {
      attributes[key] = nameWithoutQuery(value);
    } else if (typeof value === 'string' && URL_WITH_QUERY.test(value)) {
      attributes[key] = withoutQuery(value);
    }
  }
}

/**
 * Last filter before an error event leaves the server: only the safe request headers remain,
 * and cookies, query strings, bodies, client addresses and user details are removed.
 */
export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
  const request = event.request;
  if (request) {
    for (const name of Object.keys(request.headers ?? {})) {
      if (!SAFE_HEADER_SET.has(name.toLowerCase())) delete request.headers?.[name];
    }
    delete request.cookies;
    delete request.query_string;
    delete request.data;
    if (request.url) request.url = withoutQuery(request.url);
  }
  delete event.user;
  scrubAttributes(event.contexts?.trace?.data);
  return event;
}

/**
 * Filter for every span sent when tracing is on (SENTRY_TRACES_SAMPLE_RATE above 0), including
 * the root span of each request: names and URL attributes lose their query strings, and bodies,
 * client addresses, user details and private headers are removed. It must not throw: the SDK
 * would then send the span unfiltered.
 */
export function scrubSpan<T extends ScrubbableSpan>(span: T): T {
  if (typeof span.name === 'string') span.name = nameWithoutQuery(span.name);
  scrubAttributes(span.attributes);
  return span;
}

/**
 * Filter for the breadcrumbs sent with an event. The SDK records the server's outgoing fetch and
 * HTTP calls (to the API and Supabase, for example) with their URL and query string, and console
 * output, which can quote anything the server logged. URLs keep only their origin and path;
 * console breadcrumbs are dropped.
 */
export function scrubBreadcrumb<T extends ScrubbableBreadcrumb>(breadcrumb: T): T | null {
  if (breadcrumb.category === 'console') return null;
  scrubAttributes(breadcrumb.data);
  return breadcrumb;
}

/**
 * Sentry options for the web server, read at runtime so one image serves every environment.
 * Returns null (reporting off) when SENTRY_DSN is unset or empty.
 */
export function sentryOptions(env: Env = process.env): WebSentryOptions | null {
  const dsn = env.SENTRY_DSN?.trim();
  if (!dsn) return null;
  if (!SENTRY_DSN_PATTERN.test(dsn)) {
    throw new Error('SENTRY_DSN must be a Sentry DSN: https://<key>@<host>/<project id>.');
  }
  const rate = Number(env.SENTRY_TRACES_SAMPLE_RATE?.trim() || '0');
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
    throw new Error('SENTRY_TRACES_SAMPLE_RATE must be a number between 0 and 1.');
  }
  const options = {
    dsn,
    environment: env.SENTRY_ENVIRONMENT?.trim() || env.NODE_ENV || 'development',
    release: env.APP_VERSION?.trim() || undefined,
    // Always explicit: left undefined, the SDK would read SENTRY_TRACES_SAMPLE_RATE unvalidated.
    tracesSampleRate: rate,
    traceLifecycle: 'stream',
    dataCollection: DATA_COLLECTION,
    beforeSend: scrubEvent,
    beforeSendSpan: scrubSpan,
    beforeBreadcrumb: scrubBreadcrumb,
  } satisfies WebSentryOptions & NodeOptions;
  return options;
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

/** The request as Sentry may see it: no query string and only the safe headers. */
export function redactRequest(request: ErrorRequest): ErrorRequest {
  const headers: ErrorRequest['headers'] = {};
  for (const [name, value] of Object.entries(request.headers)) {
    if (SAFE_HEADER_SET.has(name.toLowerCase())) headers[name] = value;
  }
  return { ...request, path: request.path.split('?')[0], headers };
}

/** Reports a server-side error (render, route handler, Server Action, proxy); a no-op when off. */
export function reportRequestError(error: unknown, request: ErrorRequest, context: ErrorContext): void {
  reporter?.captureRequestError(error, redactRequest(request), context);
}
