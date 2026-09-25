/**
 * `npm run setup`: prepares a local checkout once `npm run supabase:start` is running (README, Quick start).
 *
 * 1. Copies each .env.example to the file its app reads, unless that file already exists.
 * 2. Fills in empty values only: the local Supabase keys, read from `npx supabase status -o env`, and one
 *    random INTERNAL_API_SECRET shared by the API and the web app. Values already set are never changed.
 * 3. Applies the migrations and loads the demo data (`npm run db:deploy`, then `npm run db:seed`), but only
 *    into a database on this machine.
 *
 * `--env-only` stops after step 2.
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { envValue, fillEmpty, isLocalDatabase, localSupabaseKeys, parseEnvOutput } from './setup-local-core';

const ROOT = resolve(__dirname, '..');
const ENV_ONLY = process.argv.includes('--env-only');
const WINDOWS = process.platform === 'win32';

const FILES = {
  api: { example: 'apps/api/.env.example', target: 'apps/api/.env' },
  web: { example: 'apps/web/.env.example', target: 'apps/web/.env.local' },
  database: { example: 'packages/database/.env.example', target: 'packages/database/.env' },
} as const;
type App = keyof typeof FILES;

const read = (app: App) => readFileSync(resolve(ROOT, FILES[app].target), 'utf8');

function fill(app: App, values: Record<string, string | null>): void {
  const { content, filled } = fillEmpty(read(app), values);
  if (filled.length === 0) return;
  writeFileSync(resolve(ROOT, FILES[app].target), content);
  console.log(`  ${FILES[app].target}: set ${filled.join(', ')}`);
}

function npm(...args: string[]): boolean {
  return spawnSync('npm', args, { cwd: ROOT, stdio: 'inherit', shell: WINDOWS }).status === 0;
}

console.log('1. Environment files');
for (const { example, target } of Object.values(FILES)) {
  if (existsSync(resolve(ROOT, target))) {
    console.log(`  ${target}: exists, kept`);
  } else {
    copyFileSync(resolve(ROOT, example), resolve(ROOT, target));
    console.log(`  ${target}: created from ${example}`);
  }
}

console.log('2. Local keys');
const status = spawnSync('npx', ['supabase', 'status', '-o', 'env'], { cwd: ROOT, encoding: 'utf8', shell: WINDOWS });
const keys = status.status === 0 ? localSupabaseKeys(parseEnvOutput(status.stdout)) : { publishableKey: null, secretKey: null };
if (!keys.publishableKey || !keys.secretKey) {
  console.warn('  `npx supabase status` gave no keys. Is the local stack running (`npm run supabase:start`)?');
}
const internalSecret = envValue(read('api'), 'INTERNAL_API_SECRET') || envValue(read('web'), 'INTERNAL_API_SECRET') || randomBytes(36).toString('base64url');
fill('api', { SUPABASE_SECRET_KEY: keys.secretKey, INTERNAL_API_SECRET: internalSecret });
fill('web', { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: keys.publishableKey, INTERNAL_API_SECRET: internalSecret });
fill('database', { SUPABASE_SECRET_KEY: keys.secretKey });

const missing = [
  ['api', 'SUPABASE_SECRET_KEY'],
  ['web', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'],
  ['database', 'SUPABASE_SECRET_KEY'],
].filter(([app, name]) => !envValue(read(app as App), name as string));
for (const [app, name] of missing) {
  console.warn(`  ${FILES[app as App].target}: ${name} is still empty; copy it from \`npx supabase status\`.`);
}

if (ENV_ONLY) process.exit(0);

console.log('3. Database');
// A variable set in the shell wins over the .env file, for Prisma and the seed as well as here.
const databaseUrl = process.env.DATABASE_URL || envValue(read('database'), 'DATABASE_URL');
if (!isLocalDatabase(databaseUrl)) {
  console.error('  DATABASE_URL does not point to this machine, so setup loads no data. Run `npm run db:deploy` and `npm run db:seed` yourself if you mean it.');
  process.exit(1);
}
if (!npm('run', 'db:deploy') || !npm('run', 'db:seed')) process.exit(1);
console.log('Ready: `npm run dev` starts the API on :3000 and the web app on :3002.');
