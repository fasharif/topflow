import { z } from 'zod';

/** Treats an empty variable (`SENTRY_DSN=` in an env file or compose) as unset. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (value) => (value === '' ? undefined : value),
    schema.optional(),
  );

/**
 * Error-reporting settings, also validated by the environment contract (config/env.ts) so the
 * release preflight rejects a malformed DSN. Sentry stays off unless SENTRY_DSN is set. This file
 * does not load the SDK, so the preflight stays light.
 */
export const sentryEnvShape = {
  SENTRY_DSN: optional(z.url({ protocol: /^https?$/ })),
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

/** The part of a Sentry event that can carry request details. */
export interface ScrubbableEvent {
  request?: {
    url?: string;
    headers?: Record<string, string>;
    cookies?: unknown;
    query_string?: unknown;
    data?: unknown;
  };
}

/** Headers that carry sessions, secrets or shoppers' addresses. */
const PRIVATE_HEADERS = new Set([
  'authorization',
  'cookie',
  'x-topflow-internal-auth',
  'x-topflow-client-ip',
  'x-forwarded-for',
  'x-real-ip',
]);

/**
 * Last filter before an event leaves the process: whatever the SDK collected about the request,
 * credentials, client addresses, query strings and bodies are removed.
 */
export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
  const request = event.request;
  if (request) {
    for (const name of Object.keys(request.headers ?? {})) {
      if (PRIVATE_HEADERS.has(name.toLowerCase()))
        delete request.headers?.[name];
    }
    delete request.cookies;
    delete request.query_string;
    delete request.data;
    if (request.url) request.url = request.url.split('?')[0];
  }
  return event;
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
  const data = breadcrumb.data;
  if (data) {
    if (typeof data.url === 'string') data.url = data.url.split(/[?#]/)[0];
    delete data['http.query'];
    delete data['http.fragment'];
  }
  return breadcrumb;
}

export interface SentryOptions {
  dsn: string;
  environment: string;
  release: string;
  tracesSampleRate: number;
  /** Never send cookies, IP addresses or user details to Sentry. */
  sendDefaultPii: false;
  beforeSend: typeof scrubEvent;
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
  return {
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
    release: env.APP_VERSION,
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE ?? 0,
    sendDefaultPii: false,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  };
}
