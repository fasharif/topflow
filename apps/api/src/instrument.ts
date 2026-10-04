/**
 * Loaded first by main.ts: Sentry must start before NestJS and Express are imported so it can
 * instrument them. Without SENTRY_DSN nothing is initialised.
 */
import 'dotenv/config';
import { initErrorReporting } from './observability/sentry';

initErrorReporting();
