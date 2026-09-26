import { DEMO_ACCOUNT_PASSWORD } from '@topflow/shared';

/**
 * Where the stack under test runs. The defaults match the local stack described in
 * docs/OPERATIONS.md (section 9): `npm run supabase:start`, the API on :3000 and the web app on
 * :3002. CI and other environments override them with E2E_* variables.
 */
function origin(name: string, fallback: string): string {
  const value = process.env[name]?.trim() || fallback;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute URL (got "${value}")`);
  }
  return parsed.href.replace(/\/+$/, '');
}

export const stack = {
  /** The Next.js web app: storefront, trade portal, back office and the /api backend-for-frontend. */
  webUrl: origin('E2E_WEB_URL', 'http://localhost:3002'),
  /** The NestJS API, used for readiness checks only: tests act through the web app. */
  apiUrl: origin('E2E_API_URL', 'http://localhost:3000'),
  /** Mailpit, which catches every email the local Supabase stack sends. */
  mailpitUrl: origin('E2E_MAILPIT_URL', 'http://127.0.0.1:54324'),
  /** Password of the seeded demo accounts (`SEED_DEMO_PASSWORD`, else the published demo password). */
  demoPassword: process.env.E2E_DEMO_PASSWORD?.trim() || process.env.SEED_DEMO_PASSWORD?.trim() || DEMO_ACCOUNT_PASSWORD,
} as const;

/** Short, unique suffix for data a test run creates (emails, project references). */
export function runId(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1296)
    .toString(36)
    .padStart(2, '0')}`;
}
