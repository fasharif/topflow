/**
 * Build-time configuration from `apps/mobile/.env` (see `.env.example`).
 *
 * Expo inlines `EXPO_PUBLIC_*` variables when it bundles the app, and only when they are referenced
 * statically (dot notation), so they are read here and nowhere else. Restart Expo with
 * `npx expo start --clear` after changing them. They ship inside the app: never put secrets in them.
 */

function origin(value: string | undefined): string {
  return (value ?? '').trim().replace(/\/+$/, '');
}

/** The Top Flow API. It must be reachable from the phone or emulator. */
export const API_URL = origin(process.env.EXPO_PUBLIC_API_URL);

/**
 * The Top Flow web app. It serves product photos and the pages that sign-up confirmation and
 * password recovery emails open (`/auth/confirm`).
 */
export const WEB_URL = origin(process.env.EXPO_PUBLIC_WEB_URL);

/** The Supabase project that owns identities, passwords and sessions (Supabase Auth). */
export const SUPABASE_URL = origin(process.env.EXPO_PUBLIC_SUPABASE_URL);

/**
 * The project's publishable key. Publishable keys are designed to ship in apps: the Top Flow API
 * verifies every access token and authorizes each request itself.
 */
export const SUPABASE_PUBLISHABLE_KEY = (process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '').trim();

/** An absolute URL on the web app for `path` (starting with `/`), or `undefined` without `EXPO_PUBLIC_WEB_URL`. */
export function webUrl(path: string): string | undefined {
  return WEB_URL ? `${WEB_URL}${path}` : undefined;
}
