import * as Sentry from '@sentry/nestjs';
import { sentryOptions } from './sentry-config';

export { sentryOptions, type SentryOptions } from './sentry-config';

/** The part of the Sentry SDK the API uses (replaced by a fake in tests). */
export type ErrorReportingSdk = Pick<
  typeof Sentry,
  'init' | 'captureException'
>;

let reporter: ErrorReportingSdk | null = null;

/**
 * Starts Sentry when SENTRY_DSN is set. Without it the SDK is never initialised and
 * reportServerError does nothing. Called once from instrument.ts, before the application loads.
 */
export function initErrorReporting(
  source: NodeJS.ProcessEnv = process.env,
  sdk: ErrorReportingSdk = Sentry,
): boolean {
  const options = sentryOptions(source);
  if (!options) {
    reporter = null;
    return false;
  }
  sdk.init(options);
  reporter = sdk;
  return true;
}

export interface ServerErrorContext {
  requestId?: string;
  method: string;
  /** Route path without the query string, which may carry personal data. */
  path: string;
}

/** Reports an unexpected server error; a no-op when error reporting is off. */
export function reportServerError(
  error: unknown,
  context: ServerErrorContext,
): void {
  reporter?.captureException(error, {
    tags: { requestId: context.requestId ?? 'unknown' },
    extra: { method: context.method, path: context.path },
  });
}
