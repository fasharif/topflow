import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseCookieOptions, supabaseEnv } from './config';

/**
 * Supabase client for Server Components, Server Actions and Route Handlers. Create one per request;
 * never keep it in a module-level variable (Fluid compute shares instances between requests).
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = supabaseEnv();

  return createServerClient(url, publishableKey, {
    cookieOptions: supabaseCookieOptions,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot write cookies; proxy.ts refreshes sessions before rendering.
        }
      },
    },
  });
}
