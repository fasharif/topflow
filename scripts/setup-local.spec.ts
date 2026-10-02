import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { envValue, fillEmpty, isLocalDatabase, localSupabaseKeys, parseEnvOutput } from './setup-local-core';

// Sample output in the `NAME="value"` form of `npx supabase status -o env` (values shortened). It was
// written for this test, not captured from a running stack: see the README's Quick start.
const STATUS = [
  'ANON_KEY="eyJhbGciOiJIUzI1NiJ9.anon"',
  'API_URL="http://127.0.0.1:54321"',
  'DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"',
  'PUBLISHABLE_KEY="sb_publishable_local"',
  'SECRET_KEY="sb_secret_local"',
  'SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiJ9.service"',
  '',
].join('\n');

const API_EXAMPLE = [
  '# ─── Supabase Auth ───',
  'SUPABASE_URL=http://127.0.0.1:54321',
  '# Server-only secret key (sb_secret_…).',
  'SUPABASE_SECRET_KEY=',
  'INTERNAL_API_SECRET=',
  'NODE_ENV=development                      # development | test | production',
  'DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"',
  '',
].join('\n');

describe('npm run setup', () => {
  it('reads the keys that `supabase status -o env` prints', () => {
    assert.deepEqual(localSupabaseKeys(parseEnvOutput(STATUS)), { publishableKey: 'sb_publishable_local', secretKey: 'sb_secret_local' });
  });

  it('falls back to the legacy anon and service-role keys of older CLI versions', () => {
    const legacy = STATUS.split('\n')
      .filter((line) => !line.startsWith('PUBLISHABLE_KEY') && !line.startsWith('SECRET_KEY'))
      .join('\n');
    assert.deepEqual(localSupabaseKeys(parseEnvOutput(legacy)), {
      publishableKey: 'eyJhbGciOiJIUzI1NiJ9.anon',
      secretKey: 'eyJhbGciOiJIUzI1NiJ9.service',
    });
    assert.deepEqual(localSupabaseKeys(parseEnvOutput('Stopped services: [supabase_db]\n')), { publishableKey: null, secretKey: null });
  });

  it('reads values without quotes or inline comments', () => {
    assert.equal(envValue(API_EXAMPLE, 'NODE_ENV'), 'development');
    assert.equal(envValue(API_EXAMPLE, 'DATABASE_URL'), 'postgresql://postgres:postgres@127.0.0.1:54322/postgres');
    assert.equal(envValue(API_EXAMPLE, 'SUPABASE_SECRET_KEY'), '');
    assert.equal(envValue(API_EXAMPLE, 'MISSING'), '');
  });

  it('fills empty values only and keeps every other line', () => {
    const { content, filled } = fillEmpty(API_EXAMPLE, {
      SUPABASE_SECRET_KEY: 'sb_secret_local',
      INTERNAL_API_SECRET: 'shared-secret',
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://elsewhere/db',
    });
    assert.deepEqual(filled, ['SUPABASE_SECRET_KEY', 'INTERNAL_API_SECRET']);
    assert.equal(envValue(content, 'SUPABASE_SECRET_KEY'), 'sb_secret_local');
    assert.equal(envValue(content, 'NODE_ENV'), 'development');
    assert.equal(envValue(content, 'DATABASE_URL'), 'postgresql://postgres:postgres@127.0.0.1:54322/postgres');
    assert.equal(content.split('\n').length, API_EXAMPLE.split('\n').length);
    assert.ok(content.startsWith('# ─── Supabase Auth ───\n'));

    const again = fillEmpty(content, { SUPABASE_SECRET_KEY: 'sb_secret_other' });
    assert.deepEqual(again.filled, []);
    assert.equal(again.content, content);
  });

  it('skips keys it could not read', () => {
    assert.deepEqual(fillEmpty(API_EXAMPLE, { SUPABASE_SECRET_KEY: null }).filled, []);
  });

  it('loads data only into a database on this machine', () => {
    assert.equal(isLocalDatabase('postgresql://postgres:postgres@127.0.0.1:54322/postgres'), true);
    assert.equal(isLocalDatabase('postgresql://postgres:postgres@localhost:5432/topflow'), true);
    assert.equal(isLocalDatabase('postgresql://postgres.ref:pw@aws-1-ap-south-1.pooler.supabase.com:5432/postgres'), false);
    assert.equal(isLocalDatabase(''), false);
  });
});
