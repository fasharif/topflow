import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { createHttpClient, formatResults, runSmokeTest, type SmokeOptions } from './smoke-test.mts';

/** A fake deployment: web, API and Supabase Auth on one local server, with switches for failures. */
const state = { version: 'sha-1a2b3c4', database: 'up', sitemapHost: '', readyFailuresLeft: 0 };
const ORG = '7f3c2a8e-0000-4000-8000-000000000001';
const QUOTATION = '7f3c2a8e-0000-4000-8000-000000000002';

function send(response: ServerResponse, status: number, body: unknown, type = 'application/json'): void {
  response.writeHead(status, { 'content-type': type });
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
      return send(response, 200, `User-Agent: *\nSitemap: ${state.sitemapHost}/sitemap.xml\n`, 'text/plain');
    case 'GET /':
      return send(response, 200, '<!doctype html><title>Top Flow Hub</title>', 'text/html; charset=utf-8');
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
      return authorised ? send(response, 200, { email: 'buyer@example.com', role: 'CUSTOMER', memberships: [{ organizationId: ORG }] }) : send(response, 401, { message: 'Authentication required' });
    case 'GET /org/quotations':
      return request.headers['x-organization-id'] === ORG ? send(response, 200, { items: [{ id: QUOTATION }] }) : send(response, 403, {});
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
    state.sitemapHost = base;
  });
  after(() => {
    server.close();
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
        'web: robots.txt uses the runtime site URL',
        'web: home page renders',
        'auth: password sign-in',
        'api: GET /auth/me with the Supabase token',
        'api: organization quotations',
        'api: quotation PDF renders',
      ],
    );
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
    assert.equal(results.find((result) => result.name.includes('robots'))?.ok, true, 'a trailing slash is ignored');
    state.sitemapHost = 'http://localhost:3002';
    try {
      const baked = await runSmokeTest(options(), client);
      assert.equal(baked.find((result) => result.name.includes('robots'))?.ok, false);
    } finally {
      state.sitemapHost = base;
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
});
