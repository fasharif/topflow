/**
 * Smoke test of a running TopFlow Hub deployment: the Compose stack in CI, or staging and
 * production right after a deploy.
 *
 *   node infra/scripts/smoke-test.mts --web https://localhost:8443 --api https://api.localhost:8443 \
 *     [--auth https://auth.localhost:8443] [--ca caddy-root.crt] [--expect-version sha-1a2b3c4] \
 *     [--sign-in buyer@desertbloom.ae]   (password in SMOKE_PASSWORD, Supabase key in SMOKE_SUPABASE_KEY)
 *
 * Checks: web and API liveness (and the deployed version), database readiness, Supabase Auth,
 * robots.txt built from the runtime site URL, the server-rendered home page, the portfolio notice
 * and noindex on it and, with --sign-in, a real session: Supabase password sign-in, GET /auth/me,
 * the member's quotations and a quotation PDF. With --sign-in, an account without an organisation
 * or quotations fails those checks rather than skipping them. Every check is retried (--attempts,
 * --delay-ms), so the test can run while a rolling deployment settles, and one slow response is
 * not an outage.
 */
import { lookup } from 'node:dns';
import { appendFileSync, readFileSync, realpathSync } from 'node:fs';
import http, { type IncomingHttpHeaders } from 'node:http';
import https from 'node:https';
import type { LookupFunction } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import { rootCertificates } from 'node:tls';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export interface HttpResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
}

export interface RequestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export type HttpClient = (url: string, init?: RequestInit) => Promise<HttpResponse>;

export interface SignIn {
  email: string;
  password: string;
  /** Supabase publishable (anon) key; hosted projects require it on every Auth request. */
  apiKey?: string;
}

export interface SmokeOptions {
  web: string;
  api?: string;
  auth?: string;
  expectVersion?: string;
  signIn?: SignIn;
  attempts: number;
  delayMs: number;
}

export interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

/** Browsers and curl send every *.localhost name to this machine (RFC 6761); do the same. */
const localhostLookup: LookupFunction = (hostname, options, callback) => {
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    if (options.all) callback(null, [{ address: '127.0.0.1', family: 4 }]);
    else callback(null, '127.0.0.1', 4);
    return;
  }
  lookup(hostname, options, callback);
};

/** Minimal HTTP client with an optional extra certificate authority and a timeout. */
export function createHttpClient({ ca, timeoutMs = 15_000 }: { ca?: Buffer; timeoutMs?: number } = {}): HttpClient {
  return (url, init = {}) =>
    new Promise((resolve, reject) => {
      const target = new URL(url);
      const transport = target.protocol === 'https:' ? https : http;
      const request = transport.request(
        target,
        {
          method: init.method ?? 'GET',
          headers: { 'user-agent': 'topflow-hub-smoke-test', ...init.headers },
          lookup: localhostLookup,
          timeout: timeoutMs,
          // An extra authority (the Compose proxy's) on top of the public ones, never instead of them.
          ...(ca && { ca: [...rootCertificates, ca.toString('utf8')], agent: false }),
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => resolve({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks) }));
          response.on('error', reject);
        },
      );
      request.on('timeout', () => request.destroy(new Error(`timed out after ${timeoutMs} ms`)));
      request.on('error', reject);
      request.end(init.body);
    });
}

const trimSlash = (url: string) => url.replace(/\/+$/, '');

function json(response: HttpResponse): Record<string, unknown> {
  try {
    return JSON.parse(response.body.toString('utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** The start of the notice every page of the web app shows (apps/web/lib/portfolio.ts). */
export const PORTFOLIO_NOTICE = 'Portfolio project by Farah Sharif';

/** A whole number between min and max from a command-line option, or a clear error. */
export function parseCount(name: string, value: string, min: number, max: number): number {
  const number = Number(value);
  if (!/^[0-9]+$/.test(value.trim()) || !Number.isInteger(number) || number < min || number > max) {
    throw new Error(`${name} must be a whole number from ${min} to ${max}, not "${value}".`);
  }
  return number;
}

class CheckFailure extends Error {}

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new CheckFailure(message);
}

export async function runSmokeTest(options: SmokeOptions, client: HttpClient): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const web = trimSlash(options.web);
  const api = options.api ? trimSlash(options.api) : undefined;
  const auth = options.auth ? trimSlash(options.auth) : undefined;

  async function check(name: string, run: () => Promise<string>): Promise<boolean> {
    let detail = '';
    for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
      try {
        detail = await run();
        results.push({ name, ok: true, detail });
        return true;
      } catch (error) {
        detail = error instanceof Error ? error.message : String(error);
        if (attempt < options.attempts) await sleep(options.delayMs);
      }
    }
    results.push({ name, ok: false, detail });
    return false;
  }

  const liveness = async (url: string) => {
    const response = await client(url);
    expect(response.status === 200, `HTTP ${response.status}`);
    const body = json(response);
    expect(body.status === 'ok', `status is ${String(body.status)}`);
    if (options.expectVersion) {
      expect(body.version === options.expectVersion, `version ${String(body.version)}, expected ${options.expectVersion}`);
    }
    return `ok, version ${String(body.version)}`;
  };

  await check('web: liveness (/health)', () => liveness(`${web}/health`));
  if (api) {
    await check('api: liveness (/health)', () => liveness(`${api}/health`));
    await check('api: database readiness (/health/ready)', async () => {
      const response = await client(`${api}/health/ready`);
      const body = json(response);
      expect(response.status === 200 && body.database === 'up', `HTTP ${response.status}, database ${String(body.database)}`);
      return 'database up';
    });
  }
  if (auth) {
    await check('auth: Supabase Auth health', async () => {
      const response = await client(`${auth}/auth/v1/health`, options.signIn?.apiKey ? { headers: { apikey: options.signIn.apiKey } } : {});
      expect(response.status === 200, `HTTP ${response.status}`);
      return `ok, ${String(json(response).version ?? 'version not reported')}`;
    });
  }
  await check('web: robots.txt uses the runtime site URL', async () => {
    const response = await client(`${web}/robots.txt`);
    const expected = `Sitemap: ${web}/sitemap.xml`;
    expect(response.status === 200 && response.body.toString('utf8').includes(expected), `expected "${expected}"`);
    return expected;
  });
  let home: HttpResponse | undefined;
  await check('web: home page renders', async () => {
    const response = await client(`${web}/`);
    expect(response.status === 200, `HTTP ${response.status}`);
    expect(String(response.headers['content-type']).startsWith('text/html'), `content type ${String(response.headers['content-type'])}`);
    home = response;
    return `${response.body.length} bytes of HTML`;
  });
  await check('web: marked as a portfolio project, not indexed', async () => {
    const response = home ?? (await client(`${web}/`));
    home = undefined;
    expect(response.body.toString('utf8').includes(PORTFOLIO_NOTICE), `the page does not say "${PORTFOLIO_NOTICE}"`);
    expect(String(response.headers['x-robots-tag'] ?? '').includes('noindex'), `X-Robots-Tag is "${String(response.headers['x-robots-tag'] ?? '')}"`);
    return 'portfolio notice shown, X-Robots-Tag noindex';
  });

  if (options.signIn && auth && api) {
    const { email, password, apiKey } = options.signIn;
    let token = '';
    const signedIn = await check('auth: password sign-in', async () => {
      const response = await client(`${auth}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(apiKey && { apikey: apiKey }) },
        body: JSON.stringify({ email, password }),
      });
      const body = json(response);
      expect(response.status === 200 && typeof body.access_token === 'string', `HTTP ${response.status}: ${String(body.msg ?? body.error_description ?? body.error ?? '')}`);
      token = body.access_token;
      return `session for ${email}`;
    });
    if (signedIn) {
      const bearer = { authorization: `Bearer ${token}` };
      let organizationId = '';
      const knowsUser = await check('api: GET /auth/me with the Supabase token', async () => {
        const response = await client(`${api}/auth/me`, { headers: bearer });
        const body = json(response);
        expect(response.status === 200, `HTTP ${response.status}: ${String(body.message ?? '')}`);
        expect(body.email === email.toLowerCase(), `signed in as ${String(body.email)}`);
        const memberships = Array.isArray(body.memberships) ? (body.memberships as Array<{ organizationId?: string }>) : [];
        organizationId = memberships[0]?.organizationId ?? '';
        return `role ${String(body.role)}, ${memberships.length} organization(s)`;
      });
      // The sign-in account was chosen to exercise the trade flow: without an organisation or a
      // quotation these checks fail, so a run never passes with fewer checks than it was asked for.
      let quotationId = '';
      const orgHeaders = { ...bearer, 'x-organization-id': organizationId };
      const listed =
        knowsUser &&
        (await check('api: organization quotations', async () => {
          expect(organizationId, `${email} belongs to no organization, so there are no quotations to check`);
          const response = await client(`${api}/org/quotations`, { headers: orgHeaders });
          const items = (json(response).items ?? []) as Array<{ id?: string }>;
          expect(response.status === 200, `HTTP ${response.status}`);
          quotationId = items[0]?.id ?? '';
          expect(quotationId, `the organization of ${email} has no quotation to render`);
          return `${items.length} quotation(s)`;
        }));
      if (listed) {
        await check('api: quotation PDF renders', async () => {
          const response = await client(`${api}/org/quotations/${quotationId}/pdf`, { headers: orgHeaders });
          expect(response.status === 200, `HTTP ${response.status}`);
          expect(response.body.subarray(0, 5).toString('latin1') === '%PDF-', 'the response is not a PDF');
          return `${response.body.length} bytes`;
        });
      }
    }
  }
  return results;
}

export function formatResults(results: CheckResult[]): string {
  const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  const rows = results.map((result) => `| ${result.ok ? 'pass' : 'FAIL'} | ${cell(result.name)} | ${cell(result.detail)} |`);
  return ['| Result | Check | Detail |', '| --- | --- | --- |', ...rows].join('\n');
}

async function main(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      web: { type: 'string' },
      api: { type: 'string' },
      auth: { type: 'string' },
      ca: { type: 'string' },
      'expect-version': { type: 'string' },
      'sign-in': { type: 'string' },
      attempts: { type: 'string', default: '10' },
      'delay-ms': { type: 'string', default: '3000' },
    },
    strict: true,
  });
  if (!values.web) throw new Error('--web is required, for example --web https://localhost:8443');
  let signIn: SignIn | undefined;
  if (values['sign-in']) {
    const password = process.env.SMOKE_PASSWORD;
    if (!password) throw new Error('--sign-in needs the password in the SMOKE_PASSWORD environment variable.');
    signIn = { email: values['sign-in'], password, apiKey: process.env.SMOKE_SUPABASE_KEY || undefined };
  }
  const client = createHttpClient({ ca: values.ca ? readFileSync(values.ca) : undefined });
  const results = await runSmokeTest(
    {
      web: values.web,
      api: values.api,
      auth: values.auth,
      expectVersion: values['expect-version'],
      signIn,
      attempts: parseCount('--attempts', values.attempts, 1, 100),
      delayMs: parseCount('--delay-ms', values['delay-ms'], 0, 600_000),
    },
    client,
  );
  const table = formatResults(results);
  console.log(table);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Smoke test: ${values.web}\n\n${table}\n\n`);
  }
  const failed = results.filter((result) => !result.ok).length;
  console.log(failed === 0 ? `All ${results.length} checks passed.` : `${failed} of ${results.length} checks failed.`);
  return failed === 0 ? 0 : 1;
}

const invokedDirectly = process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 2;
    },
  );
}
