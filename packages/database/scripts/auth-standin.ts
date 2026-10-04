/**
 * A stand-in for the part of the Supabase Auth admin API that the demo seed and `npm run demo:reset`
 * call through `@supabase/supabase-js`, backed by a PostgreSQL table shaped like a Supabase project's
 * `auth.users`. It lets `npm run demo:rehearse` (demo-reset-rehearsal.ts) run the reset's Supabase
 * steps for real without a Supabase project.
 *
 * It is a test double, not an implementation of Supabase Auth: it checks only that an API key is
 * sent, stores salted scrypt hashes as a real auth server would, and issues no tokens. Routes:
 *
 *   GET    /auth/v1/admin/users?page=&per_page=    list (oldest first)
 *   POST   /auth/v1/admin/users                     create
 *   GET    /auth/v1/admin/users/:id                 read
 *   PUT    /auth/v1/admin/users/:id                 update password or confirmation
 *   DELETE /auth/v1/admin/users/:id                 delete
 */
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Pool } from 'pg';

/** Columns of Supabase's `auth.users` that the stand-in reads and writes. */
export const AUTH_USERS_COLUMNS = `
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()`;

/** A salted scrypt hash in the form `scrypt$<salt>$<hash>` (hex), as the stand-in stores passwords. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${scryptSync(password, salt, 32).toString('hex')}`;
}

/** Whether a stored hash belongs to this password, so a rehearsal can check which password was set. */
export function passwordMatches(password: string, stored: string | null): boolean {
  const [scheme, salt, hash] = (stored ?? '').split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, Buffer.from(salt, 'hex'), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export interface AuthStandIn {
  /** Use as SUPABASE_URL. */
  url: string;
  /** Every request as `METHOD /path`, in order. */
  requests: string[];
  /** Addresses whose creation answers 503, as Supabase Auth does during an outage. */
  failCreateFor: Set<string>;
  close(): Promise<void>;
}

interface UserRow {
  id: string;
  email: string;
  email_confirmed_at: Date | null;
  raw_user_meta_data: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

const USER_PATH = /^\/auth\/v1\/admin\/users\/([0-9a-f-]{36})$/i;
const LIST_PATH = '/auth/v1/admin/users';

function userJson(row: UserRow) {
  return {
    id: row.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: row.email,
    email_confirmed_at: row.email_confirmed_at?.toISOString() ?? null,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: row.raw_user_meta_data,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

function send(response: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  response.writeHead(status, { 'content-type': 'application/json', ...headers });
  response.end(JSON.stringify(body));
}

function failure(response: ServerResponse, status: number, errorCode: string, message: string): void {
  send(response, status, { code: status, error_code: errorCode, msg: message });
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

/**
 * Starts the stand-in on a free loopback port. `table` is the qualified name of its `auth.users`-shaped
 * table, such as `auth.users`, or another table to play a different Supabase project.
 */
export async function startAuthStandIn(pool: Pool, table: string): Promise<AuthStandIn> {
  if (!/^[a-z_]+\.[a-z_]+$/.test(table)) throw new Error(`Unexpected table name: ${table}`);
  const requests: string[] = [];
  const failCreateFor = new Set<string>();
  const columns = 'id::text AS id, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at';

  async function findUser(id: string): Promise<UserRow | undefined> {
    return (await pool.query<UserRow>(`SELECT ${columns} FROM ${table} WHERE id = $1`, [id])).rows[0];
  }

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', 'http://stand-in');
    requests.push(`${request.method} ${url.pathname}`);
    if (!request.headers.apikey) return failure(response, 401, 'no_authorization', 'No API key found in request');

    if (url.pathname === LIST_PATH && request.method === 'GET') {
      const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
      const perPage = Math.min(1000, Math.max(1, Number(url.searchParams.get('per_page')) || 50));
      const rows = await pool.query<UserRow>(`SELECT ${columns} FROM ${table} ORDER BY created_at, id LIMIT $1 OFFSET $2`, [
        perPage,
        (page - 1) * perPage,
      ]);
      const total = await pool.query<{ total: string }>(`SELECT count(*)::text AS total FROM ${table}`);
      return send(response, 200, { users: rows.rows.map(userJson), aud: 'authenticated' }, { 'x-total-count': total.rows[0]?.total ?? '0' });
    }

    if (url.pathname === LIST_PATH && request.method === 'POST') {
      const body = await readJson(request);
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (!email) return failure(response, 400, 'validation_failed', 'An email address is required');
      if (failCreateFor.has(email)) return failure(response, 503, 'unexpected_failure', 'Service temporarily unavailable (stand-in)');
      if ((await pool.query(`SELECT 1 FROM ${table} WHERE email = $1`, [email])).rowCount) {
        return failure(response, 422, 'email_exists', 'A user with this email address has already been registered');
      }
      const id = typeof body.id === 'string' ? body.id : randomUUID();
      const password = typeof body.password === 'string' ? hashPassword(body.password) : null;
      const created = await pool.query<UserRow>(
        `INSERT INTO ${table} (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
         VALUES ($1, $2, $3, CASE WHEN $4 THEN clock_timestamp() END, $5) RETURNING ${columns}`,
        [id, email, password, body.email_confirm === true, JSON.stringify(body.user_metadata ?? {})],
      );
      return send(response, 200, userJson(created.rows[0] as UserRow));
    }

    const match = USER_PATH.exec(url.pathname);
    if (!match?.[1]) return failure(response, 404, 'not_found', `No route for ${request.method} ${url.pathname}`);
    const id = match[1];

    if (request.method === 'GET') {
      const user = await findUser(id);
      return user ? send(response, 200, userJson(user)) : failure(response, 404, 'user_not_found', 'User not found');
    }
    if (request.method === 'PUT') {
      const body = await readJson(request);
      const updated = await pool.query<UserRow>(
        `UPDATE ${table} SET
           encrypted_password = COALESCE($2, encrypted_password),
           email_confirmed_at = CASE WHEN $3 THEN COALESCE(email_confirmed_at, clock_timestamp()) ELSE email_confirmed_at END,
           updated_at = clock_timestamp()
         WHERE id = $1 RETURNING ${columns}`,
        [id, typeof body.password === 'string' ? hashPassword(body.password) : null, body.email_confirm === true],
      );
      const user = updated.rows[0];
      return user ? send(response, 200, userJson(user)) : failure(response, 404, 'user_not_found', 'User not found');
    }
    if (request.method === 'DELETE') {
      const deleted = await pool.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
      return deleted.rowCount ? send(response, 200, {}) : failure(response, 404, 'user_not_found', 'User not found');
    }
    return failure(response, 405, 'method_not_allowed', `${request.method} is not supported`);
  }

  const server = createServer((request, response) => {
    handle(request, response).catch((error: unknown) => {
      failure(response, 500, 'unexpected_failure', error instanceof Error ? error.message : String(error));
    });
  });
  await new Promise<void>((listening) => server.listen(0, '127.0.0.1', listening));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    failCreateFor,
    close: () =>
      new Promise<void>((closed, failed) => {
        server.close((error) => (error ? failed(error) : closed()));
        server.closeAllConnections();
      }),
  };
}
