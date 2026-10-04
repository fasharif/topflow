/**
 * Absolute origin of the storefront (no trailing slash), used for page metadata and links in
 * emails. Set NEXT_PUBLIC_SITE_URL in each deployment.
 */
function resolveSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).href.replace(/\/+$/, '');
    } catch {
      // An invalid value falls back to the local default instead of breaking every page.
    }
  }
  return 'http://localhost:3002';
}

export const SITE_URL = resolveSiteUrl();

/** The origin of a configured site URL, or null when it is empty or invalid. */
export function originOf(value: string | undefined): string | null {
  const configured = value?.trim();
  if (!configured) return null;
  try {
    return new URL(configured).origin;
  } catch {
    return null;
  }
}

/** The origin of NEXT_PUBLIC_SITE_URL, or null when it is unset (Vercel previews, local development). */
export function configuredOrigin(): string | null {
  return originOf(process.env.NEXT_PUBLIC_SITE_URL);
}

/**
 * The origin visitors use to reach this app. Behind a reverse proxy (the container images) the
 * server only knows its own listening address, so the configured public origin wins; without one,
 * the origin of the request is used, as on Vercel.
 */
export function publicOrigin(requestOrigin: string, configured: string | null = configuredOrigin()): string {
  return configured ?? requestOrigin;
}
