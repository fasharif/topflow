// Type-only import: erased at compile time, so the release preflight never loads the SDK.
import type { NodeOptions } from '@sentry/nestjs';
import { z } from 'zod';

/** Treats an empty variable (`SENTRY_DSN=` in an env file or compose) as unset. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (value) => (value === '' ? undefined : value),
    schema.optional(),
  );

/**
 * The shape the SDK accepts: https://<public key>@<host>/<numeric project id>. Anything else the
 * SDK would ignore with only a console message, leaving error reporting silently off.
 */
export const SENTRY_DSN_PATTERN =
  /^https?:\/\/\w+(:\w*)?@(\[[:.%\w]+\]|[\w.-]+)(:\d+)?\/([^\s?#]+\/)?\d+$/;

/**
 * Error-reporting settings, also validated by the environment contract (config/env.ts) so the
 * release preflight rejects a malformed DSN. Sentry stays off unless SENTRY_DSN is set. This file
 * does not load the SDK, so the preflight stays light.
 */
export const sentryEnvShape = {
  SENTRY_DSN: optional(
    z
      .string()
      .regex(
        SENTRY_DSN_PATTERN,
        'must be a Sentry DSN: https://<key>@<host>/<project id>',
      ),
  ),
  /** Defaults to NODE_ENV; set it to tell staging and production apart. */
  SENTRY_ENVIRONMENT: optional(z.string().min(1)),
  /** Share of requests traced for performance (0 to 1). Errors are always reported. */
  SENTRY_TRACES_SAMPLE_RATE: optional(z.coerce.number().min(0).max(1)),
};

const sentryEnvSchema = z.object({
  ...sentryEnvShape,
  NODE_ENV: z.string().default('development'),
  APP_VERSION: z.string().default('3.0.0'),
});

type DataCollection = NonNullable<NodeOptions['dataCollection']>;

/** Request headers worth keeping for debugging; every other header is dropped. */
const SAFE_HEADERS = [
  'accept',
  'accept-encoding',
  'accept-language',
  'content-length',
  'content-type',
  'host',
  'user-agent',
  'x-request-id',
];
const SAFE_HEADER_SET = new Set(SAFE_HEADERS);

/**
 * What the SDK may collect in the first place. Sentry 11 collects cookies, headers, bodies, query
 * strings and client addresses by default and no longer has the `sendDefaultPii` switch, so every
 * category is turned off here explicitly. The scrubbers below remove anything that still gets
 * through (an integration that ignores these settings, for example).
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
export function scrubAttributes(
  attributes: Record<string, unknown> | undefined,
): void {
  if (!attributes) return;
  for (const [key, value] of Object.entries(attributes)) {
    const header = HEADER_ATTRIBUTE.exec(key);
    if (
      PRIVATE_ATTRIBUTES.has(key) ||
      BODY_ATTRIBUTE.test(key) ||
      (header && (header[1] === 'response' || !SAFE_HEADER_SET.has(header[2])))
    ) {
      delete attributes[key];
    } else if (typeof value === 'string' && NAME_ATTRIBUTES.has(key)) {
      attributes[key] = nameWithoutQuery(value);
    } else if (typeof value === 'string' && URL_WITH_QUERY.test(value)) {
      attributes[key] = withoutQuery(value);
    }
  }
}

/** The part of a Sentry error event that can carry request or user details. */
export interface ScrubbableEvent {
  request?: {
    url?: string;
    headers?: Record<string, string>;
    cookies?: unknown;
    query_string?: unknown;
    data?: unknown;
  };
  user?: unknown;
  contexts?: { trace?: { data?: Record<string, unknown> } };
}

/**
 * Last filter before an error event leaves the process: only the safe request headers remain,
 * and cookies, query strings, bodies, client addresses and user details are removed.
 */
export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
  const request = event.request;
  if (request) {
    for (const name of Object.keys(request.headers ?? {})) {
      if (!SAFE_HEADER_SET.has(name.toLowerCase()))
        delete request.headers?.[name];
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

/** The part of a streamed span (Sentry 11's default trace lifecycle) that can carry personal data. */
export interface ScrubbableSpan {
  name: string;
  attributes?: Record<string, unknown>;
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

/** The part of a Sentry breadcrumb that can carry personal data. */
export interface ScrubbableBreadcrumb {
  category?: string;
  message?: string;
  data?: Record<string, unknown>;
}

/**
 * Filter for the breadcrumbs sent with an event. The SDK records outgoing HTTP and fetch calls
 * (to Supabase, for example) with their URL and query string, and console output, which can quote
 * anything the application logged. URLs keep only their origin and path; console breadcrumbs are
 * dropped.
 */
export function scrubBreadcrumb<T extends ScrubbableBreadcrumb>(
  breadcrumb: T,
): T | null {
  if (breadcrumb.category === 'console') return null;
  scrubAttributes(breadcrumb.data);
  return breadcrumb;
}

/** The options the API passes to Sentry.init; checked against the SDK's own option type. */
export interface SentryOptions {
  dsn: string;
  environment: string;
  release: string;
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

/** Sentry options from the environment, or null when error reporting is not configured. */
export function sentryOptions(
  source: NodeJS.ProcessEnv = process.env,
): SentryOptions | null {
  const parsed = sentryEnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(
      `Invalid error-reporting configuration:\n${z.prettifyError(parsed.error)}`,
    );
  }
  const env = parsed.data;
  if (!env.SENTRY_DSN) return null;
  const options = {
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
    release: env.APP_VERSION,
    // Always explicit: left undefined, the SDK would read SENTRY_TRACES_SAMPLE_RATE unvalidated.
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE ?? 0,
    traceLifecycle: 'stream',
    dataCollection: DATA_COLLECTION,
    beforeSend: scrubEvent,
    beforeSendSpan: scrubSpan,
    beforeBreadcrumb: scrubBreadcrumb,
  } satisfies SentryOptions & NodeOptions;
  return options;
}
