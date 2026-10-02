import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, describe, it } from 'node:test';
import { createHttpClient, formatResults, parseCount, runSmokeTest, type SmokeOptions } from './smoke-test.mts';

/** A fake deployment: web, API and Supabase Auth on one local server, with switches for failures. */
const HEALTHY = {
  version: 'sha-1a2b3c4',
  database: 'up',
  readyFailuresLeft: 0,
  homeFailuresLeft: 0,
  notice: 'portfolio' as 'portfolio' | 'demo' | 'none',
  robots: 'User-Agent: *\nAllow: /\n',
  memberships: true,
  quotations: true,
};
const state = { ...HEALTHY, siteHost: '' };
const ORG = '7f3c2a8e-0000-4000-8000-000000000001';
const QUOTATION = '7f3c2a8e-0000-4000-8000-000000000002';
const HOME = {
  portfolio: '<!doctype html><title>Top Flow Hub</title><aside>Portfolio project by Farah Sharif, built with Top Flow’s permission. This is not Top Flow’s official store.</aside>',
  demo: '<!doctype html><title>TopFlow Hub portfolio demo</title><aside>Portfolio demo: data resets every night. This is not Top Flow&#x27;s official store.</aside>',
  none: '<!doctype html><title>Top Flow — official store</title>',
};

function send(response: ServerResponse, status: number, body: unknown, type = 'application/json', headers: Record<string, string> = {}): void {
  response.writeHead(status, { 'content-type': type, ...headers });
  response.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function handle(request: IncomingMessage, response: ServerResponse): void {
  const url = new URL(request.url ?? '/', 'http://fake');
  const authorised = request.headers.authorization === 'Bearer token-123';
  switch (`${request.method} ${url.pathname}`) {
    case 'GET /health':
      return send(response, 200, { status: 'ok', version: state.version });
    case 'GET /health/ready':
      if (state.readyFailuresLeft > 0) {
        state.readyFailuresLeft -= 1;
        return send(response, 503, { status: 'degraded', database: 'down' });
      }
      return send(response, state.database === 'up' ? 200 : 503, { database: state.database });
    case 'GET /auth/v1/health':
      return send(response, 200, { version: 'v2.196.0' });
    case 'GET /robots.txt':
      return send(response, 200, state.robots, 'text/plain');
    case 'GET /auth/confirm':
      return send(response, 307, '', 'text/plain', { location: `${state.siteHost}/login?error=link` });
    case 'GET /':
      if (state.homeFailuresLeft > 0) {
        state.homeFailuresLeft -= 1;
        return send(response, 502, 'Bad gateway', 'text/plain');
      }
      return state.notice === 'none'
        ? send(response, 200, HOME.none, 'text/html; charset=utf-8')
        : send(response, 200, HOME[state.notice], 'text/html; charset=utf-8', { 'x-robots-tag': 'noindex, nofollow' });
    case 'POST /auth/v1/token': {
      let raw = '';
      request.on('data', (chunk: Buffer) => (raw += chunk.toString()));
      request.on('end', () => {
        const { email, password } = JSON.parse(raw) as { email: string; password: string };
        if (password !== 'correct horse') return send(response, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
        return send(response, 200, { access_token: 'token-123', user: { email } });
      });
      return;
    }
    case 'GET /auth/me':
      return authorised
        ? send(response, 200, { email: 'buyer@example.com', role: 'CUSTOMER', memberships: state.memberships ? [{ organizationId: ORG }] : [] })
        : send(response, 401, { message: 'Authentication required' });
    case 'GET /org/quotations':
      return request.headers['x-organization-id'] === ORG ? send(response, 200, { items: state.quotations ? [{ id: QUOTATION }] : [] }) : send(response, 403, {});
    case `GET /org/quotations/${QUOTATION}/pdf`:
      return send(response, 200, Buffer.from('%PDF-1.7 fake'), 'application/pdf');
    default:
      return send(response, 404, { message: 'Not found' });
  }
}

describe('smoke test', () => {
  const server = createServer(handle);
  let base = '';
  const client = createHttpClient({ timeoutMs: 2_000 });
  const options = (overrides: Partial<SmokeOptions> = {}): SmokeOptions => ({
    web: base,
    api: base,
    auth: base,
    expectVersion: 'sha-1a2b3c4',
    attempts: 3,
    delayMs: 10,
    ...overrides,
  });

  before(async () => {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    state.siteHost = base;
  });
  after(() => {
    server.close();
  });
  // Every test starts from a healthy deployment.
  beforeEach(() => {
    Object.assign(state, HEALTHY);
  });

  it('passes every check against a healthy deployment, including a real session', async () => {
    const results = await runSmokeTest(options({ signIn: { email: 'buyer@example.com', password: 'correct horse' } }), client);
    assert.deepEqual(
      results.filter((result) => !result.ok),
      [],
    );
    assert.deepEqual(
      results.map((result) => result.name),
      [
        'web: liveness (/health)',
        'api: liveness (/health)',
        'api: database readiness (/health/ready)',
        'auth: Supabase Auth health',
        'web: email links return to the runtime site URL',
        'web: home page renders',
        'web: marked as a portfolio project, not indexed',
        'auth: password sign-in',
        'api: GET /auth/me with the Supabase token',
        'api: organization quotations',
        'api: quotation PDF renders',
      ],
    );
  });

  it('fails when the site does not say it is a portfolio project', async () => {
    state.notice = 'none';
    const results = await runSmokeTest(options({ attempts: 1 }), client);
    const notice = results.find((result) => result.name === 'web: marked as a portfolio project, not indexed');
    assert.equal(notice?.ok, false);
    assert.match(notice?.detail ?? '', /says neither "Portfolio project by Farah Sharif" nor "Portfolio demo: data resets every night\."/);
  });

  it('accepts the demo banner, which takes the portfolio notice\'s place in a demo build', async () => {
    state.notice = 'demo';
    const results = await runSmokeTest(options({ attempts: 1 }), client);
    const notice = results.find((result) => result.name === 'web: marked as a portfolio project, not indexed');
    assert.equal(notice?.ok, true);
    assert.match(notice?.detail ?? '', /^demo banner shown, X-Robots-Tag noindex/);
  });

  it('fails when robots.txt keeps crawlers away from the noindex', async () => {
    state.robots = 'User-Agent: *\nDisallow: /\n';
    const results = await runSmokeTest(options({ attempts: 1 }), client);
    const notice = results.find((result) => result.name === 'web: marked as a portfolio project, not indexed');
    assert.equal(notice?.ok, false);
    assert.match(notice?.detail ?? '', /robots\.txt disallows the whole site/);
  });

  it('retries every check, not only the health checks', async () => {
    state.homeFailuresLeft = 2;
    const results = await runSmokeTest(options(), client);
    assert.equal(results.find((result) => result.name === 'web: home page renders')?.ok, true);
    assert.equal(results.find((result) => result.name.startsWith('web: marked'))?.ok, true);
  });

  it('fails, rather than skips, when the sign-in account has no organization', async () => {
    state.memberships = false;
    const results = await runSmokeTest(options({ attempts: 1, signIn: { email: 'buyer@example.com', password: 'correct horse' } }), client);
    const quotations = results.find((result) => result.name === 'api: organization quotations');
    assert.equal(quotations?.ok, false);
    assert.match(quotations?.detail ?? '', /belongs to no organization/);
  });

  it('fails, rather than skips, when there is no quotation to render', async () => {
    state.quotations = false;
    const results = await runSmokeTest(options({ attempts: 1, signIn: { email: 'buyer@example.com', password: 'correct horse' } }), client);
    const quotations = results.find((result) => result.name === 'api: organization quotations');
    assert.equal(quotations?.ok, false);
    assert.match(quotations?.detail ?? '', /has no quotation to render/);
    assert.equal(results.filter((result) => !result.ok).length, 1);
  });

  it('accepts only whole numbers in range for --attempts and --delay-ms', () => {
    assert.equal(parseCount('--attempts', '3', 1, 100), 3);
    assert.equal(parseCount('--delay-ms', '0', 0, 600_000), 0);
    for (const value of ['', 'abc', '2.5', '-1', '0', '101', '1e2']) {
      assert.throws(() => parseCount('--attempts', value, 1, 100), /--attempts must be a whole number from 1 to 100/, value);
    }
  });

  it('fails when the deployed version is not the one expected', async () => {
    const results = await runSmokeTest(options({ expectVersion: 'sha-0000000', attempts: 1 }), client);
    const web = results.find((result) => result.name === 'web: liveness (/health)');
    assert.equal(web?.ok, false);
    assert.match(web?.detail ?? '', /version sha-1a2b3c4, expected sha-0000000/);
  });

  it('retries readiness while a deployment settles, then passes', async () => {
    state.readyFailuresLeft = 2;
    const results = await runSmokeTest(options(), client);
    assert.equal(results.find((result) => result.name.includes('readiness'))?.ok, true);
  });

  it('reports a database outage after the last attempt', async () => {
    state.database = 'down';
    try {
      const results = await runSmokeTest(options(), client);
      const ready = results.find((result) => result.name.includes('readiness'));
      assert.equal(ready?.ok, false);
      assert.match(ready?.detail ?? '', /HTTP 503, database down/);
    } finally {
      state.database = 'up';
    }
  });

  it('catches a site URL baked in at build time', async () => {
    const results = await runSmokeTest(options({ web: `${base}/` }), client);
    assert.equal(results.find((result) => result.name.includes('email links'))?.ok, true, 'a trailing slash is ignored');
    state.siteHost = 'http://localhost:3002';
    try {
      const baked = await runSmokeTest(options(), client);
      const emailLinks = baked.find((result) => result.name.includes('email links'));
      assert.equal(emailLinks?.ok, false);
      assert.match(emailLinks?.detail ?? '', /HTTP 307 to "http:\/\/localhost:3002\/login\?error=link"/);
    } finally {
      state.siteHost = base;
    }
  });

  it('stops after a failed sign-in and explains why', async () => {
    const results = await runSmokeTest(options({ signIn: { email: 'buyer@example.com', password: 'wrong' } }), client);
    const signIn = results.find((result) => result.name === 'auth: password sign-in');
    assert.equal(signIn?.ok, false);
    assert.match(signIn?.detail ?? '', /Invalid login credentials/);
    assert.equal(results.some((result) => result.name.includes('/auth/me')), false);
  });

  it('reports an unreachable service instead of throwing', async () => {
    const results = await runSmokeTest({ web: 'http://127.0.0.1:1', attempts: 1, delayMs: 0 }, client);
    assert.equal(results[0]?.ok, false);
    assert.ok(results.every((result) => !result.ok));
  });

  it('formats a Markdown table for the job summary', () => {
    const table = formatResults([
      { name: 'web: liveness (/health)', ok: true, detail: 'ok' },
      { name: 'api: pipe | in detail', ok: false, detail: 'a | b' },
    ]);
    assert.match(table, /^\| Result \| Check \| Detail \|/);
    assert.ok(table.includes('| FAIL | api: pipe \\| in detail | a \\| b |'), table);
  });

  it('escapes backslashes so they cannot swallow a cell border', () => {
    const table = formatResults([{ name: 'ca: C:\\certs\\ca.pem', ok: false, detail: 'ends with \\' }]);
    assert.ok(table.includes('| FAIL | ca: C:\\\\certs\\\\ca.pem | ends with \\\\ |'), table);
  });
});
