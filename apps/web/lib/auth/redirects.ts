import { isStaffRole, type AuthUser } from '@topflow/shared';

/**
 * Resolves where to go after an authentication step. Only destinations on this site are followed,
 * which prevents open-redirect phishing links; absolute URLs are accepted when they point to
 * `origin` (Supabase email links carry the full redirect URL).
 */
export function safeNextPath(value: string | null | undefined, origin: string, fallback: string): string {
  if (!value) return fallback;
  if (value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\')) return value;
  try {
    const url = new URL(value);
    if (url.origin === origin) return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    // Not a URL: fall through to the default destination.
  }
  return fallback;
}

/** The home area of a signed-in user: back office for staff, trade portal for members, account otherwise. */
export function landingPath(user: Pick<AuthUser, 'role' | 'memberships'>): string {
  if (isStaffRole(user.role)) return '/admin';
  return user.memberships.length > 0 ? '/business' : '/account';
}
