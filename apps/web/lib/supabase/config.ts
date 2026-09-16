import type { CookieOptionsWithName } from '@supabase/ssr';

/** Supabase project settings for the web app's server. The publishable key is not a secret. */
export function supabaseEnv(): { url: string; publishableKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set.');
  }
  return { url, publishableKey };
}

/**
 * Session cookies are httpOnly: Supabase runs only on this server (Server Actions, Route Handlers,
 * Proxy), so no access or refresh token is ever readable by browser JavaScript.
 */
export const supabaseCookieOptions: CookieOptionsWithName = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
};
