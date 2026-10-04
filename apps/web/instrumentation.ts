import type { Instrumentation } from 'next';
import { reportRequestError, startErrorReporting } from '@/lib/observability/sentry';

/** Server start-up: error reporting on the Node.js runtime when SENTRY_DSN is set. */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') await startErrorReporting();
}

/** Errors in Server Components, Route Handlers, Server Actions and the proxy. */
export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  reportRequestError(error, request, context);
};
