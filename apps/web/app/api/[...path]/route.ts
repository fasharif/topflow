import type { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const API_ORIGIN = (process.env.API_INTERNAL_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET;

const WITH_BODY = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const REQUEST_HEADERS = ['accept', 'accept-language', 'content-type', 'if-none-match', 'user-agent', 'x-organization-id', 'x-request-id'];
const RESPONSE_HEADERS = [
  'cache-control',
  'content-disposition',
  'content-type',
  'etag',
  'retry-after',
  'x-request-id',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
];

function problem(status: number, error: string, message: string): Response {
  return Response.json({ statusCode: status, error, message }, { status });
}

/** Browsers send Origin on cross-site requests; state-changing calls must come from this site. */
function isSameSite(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (origin) return origin === request.nextUrl.origin;
  const site = request.headers.get('sec-fetch-site');
  return site === null || site === 'same-origin' || site === 'none';
}

function clientAddress(request: NextRequest): string | null {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip');
}

/**
 * Backend for frontend. The browser calls /api/* on this origin; this handler adds the Supabase
 * access token from the httpOnly session cookies (refreshing it when needed) and forwards the
 * request to the NestJS API, which authenticates and authorises every call. Tokens never reach
 * browser JavaScript, and cross-site writes are refused.
 */
async function forward(request: NextRequest, context: RouteContext<'/api/[...path]'>): Promise<Response> {
  if (WITH_BODY.has(request.method) && !isSameSite(request)) {
    return problem(403, 'Forbidden', 'Cross-site requests are not allowed.');
  }

  const { path } = await context.params;
  const target = new URL(`${API_ORIGIN}/${path.map(encodeURIComponent).join('/')}`);
  target.search = request.nextUrl.search;

  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // Anonymous visitors: answer "who am I?" here instead of a round trip to the API.
  if (!session && path.join('/') === 'auth/me') {
    return problem(401, 'Unauthorized', 'Authentication required');
  }

  const headers = new Headers();
  for (const name of REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (session) headers.set('authorization', `Bearer ${session.access_token}`);
  if (INTERNAL_API_SECRET) {
    headers.set('x-topflow-internal-auth', INTERNAL_API_SECRET);
    const address = clientAddress(request);
    if (address) headers.set('x-topflow-client-ip', address);
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: WITH_BODY.has(request.method) ? await request.arrayBuffer() : undefined,
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return problem(502, 'Bad Gateway', 'The service is temporarily unavailable. Please try again.');
  }

  const responseHeaders = new Headers();
  for (const name of RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}

export { forward as DELETE, forward as GET, forward as PATCH, forward as POST, forward as PUT };
