import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { buildEnv, DEFAULTS, formatEnv, publicUrl, signJwt, writeSecretFile } from './generate-env.mts';

const script = fileURLToPath(new URL('./generate-env.mts', import.meta.url));

function decode(token: string): { header: unknown; payload: Record<string, unknown>; signed: string; signature: string } {
  const [header = '', payload = '', signature = ''] = token.split('.');
  return {
    header: JSON.parse(Buffer.from(header, 'base64url').toString()),
    payload: JSON.parse(Buffer.from(payload, 'base64url').toString()) as Record<string, unknown>,
    signed: `${header}.${payload}`,
    signature,
  };
}

describe('generate-env', () => {
  it('signs HS256 tokens that verify with the secret', () => {
    const token = signJwt({ role: 'anon' }, 'a-secret');
    const { header, payload, signed, signature } = decode(token);
    assert.deepEqual(header, { alg: 'HS256', typ: 'JWT' });
    assert.deepEqual(payload, { role: 'anon' });
    assert.equal(signature, createHmac('sha256', 'a-secret').update(signed).digest('base64url'));
  });

  it('derives one set of public URLs from the ports, for browsers and containers alike', () => {
    const env = buildEnv({ ...DEFAULTS, httpsPort: 55843, httpPort: 55880 });
    assert.equal(env.get('SITE_URL'), 'https://localhost:55843');
    assert.equal(env.get('API_PUBLIC_URL'), 'https://api.localhost:55843');
    assert.equal(env.get('SUPABASE_URL'), 'https://auth.localhost:55843');
    assert.equal(env.get('HTTP_PORT'), '55880');
    assert.equal(publicUrl('hub.example.com', 443), 'https://hub.example.com');
  });

  it('creates secrets long enough for the API and keys Supabase Auth accepts', () => {
    const now = Date.UTC(2026, 8, 26);
    const env = buildEnv(DEFAULTS, undefined, now);
    const secret = env.get('JWT_SECRET') ?? '';
    assert.ok(secret.length >= 32, 'SUPABASE_JWT_SECRET needs 32+ characters');
    assert.ok((env.get('INTERNAL_API_SECRET') ?? '').length >= 32, 'INTERNAL_API_SECRET needs 32+ characters');
    assert.match(env.get('POSTGRES_PASSWORD') ?? '', /^[0-9a-f]{48}$/);
    assert.notEqual(env.get('POSTGRES_PASSWORD'), env.get('AUTH_DB_PASSWORD'));

    for (const [key, role] of [
      ['ANON_KEY', 'anon'],
      ['SERVICE_ROLE_KEY', 'service_role'],
    ] as const) {
      const { payload, signed, signature } = decode(env.get(key) ?? '');
      assert.equal(payload.role, role);
      assert.equal(payload.iat, now / 1000);
      assert.ok(Number(payload.exp) > now / 1000 + 4 * 365 * 24 * 3600);
      assert.equal(signature, createHmac('sha256', secret).update(signed).digest('base64url'));
    }
  });

  it('never reuses secrets between runs', () => {
    assert.notEqual(buildEnv(DEFAULTS).get('JWT_SECRET'), buildEnv(DEFAULTS).get('JWT_SECRET'));
  });

  it('rejects invalid ports and project names with a clear message', () => {
    assert.throws(() => buildEnv({ ...DEFAULTS, httpsPort: 70_000 }), /--https-port must be a port number/);
    assert.throws(() => buildEnv({ ...DEFAULTS, dbPort: Number.NaN }), /--db-port/);
    assert.throws(() => buildEnv({ ...DEFAULTS, project: 'Top Flow' }), /--project/);
  });

  it('writes plain KEY=value lines that Compose reads without quoting', () => {
    const text = formatEnv(buildEnv(DEFAULTS));
    const keys = text
      .split('\n')
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => line.split('=')[0]);
    assert.ok(keys.includes('SERVICE_ROLE_KEY'));
    assert.ok(text.includes('\nSENTRY_DSN=\n'));
    assert.throws(() => formatEnv(new Map([['BAD', 'has space']])), /BAD contains characters/);
  });

  it('refuses to overwrite an existing file unless forced', () => {
    const dir = mkdtempSync(join(tmpdir(), 'topflow-env-'));
    try {
      const out = join(dir, '.env');
      // A readable copy, as `cp` or an editor might leave it: --force must not keep that mode.
      writeFileSync(out, 'KEEP=1\n', { mode: 0o644 });
      const refused = spawnSync(process.execPath, [script, '--out', out], { encoding: 'utf8' });
      assert.equal(refused.status, 1);
      assert.match(refused.stderr, /already exists/);
      assert.equal(readFileSync(out, 'utf8'), 'KEEP=1\n');

      const forced = spawnSync(process.execPath, [script, '--out', out, '--force', '--https-port', '9443'], { encoding: 'utf8' });
      assert.equal(forced.status, 0, forced.stderr);
      assert.match(readFileSync(out, 'utf8'), /^SITE_URL=https:\/\/localhost:9443$/m);
      if (process.platform !== 'win32') assert.equal(statSync(out).mode & 0o777, 0o600);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('narrows an existing file to owner-only before writing secrets into it', { skip: process.platform === 'win32' && 'Windows has no POSIX file modes' }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'topflow-env-'));
    try {
      const out = join(dir, '.env');
      writeFileSync(out, 'OLD=1\n');
      chmodSync(out, 0o666);
      writeSecretFile(out, 'SECRET=2\n');
      assert.equal(statSync(out).mode & 0o777, 0o600);
      assert.equal(readFileSync(out, 'utf8'), 'SECRET=2\n');

      const created = join(dir, 'new.env');
      writeSecretFile(created, 'SECRET=3\n');
      assert.equal(statSync(created).mode & 0o777, 0o600);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
