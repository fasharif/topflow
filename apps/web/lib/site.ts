/**
 * Absolute origin of the storefront (no trailing slash), used for metadata, the sitemap,
 * robots.txt and structured data. Set NEXT_PUBLIC_SITE_URL in each deployment.
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

/** "https://hub.example.com/products" from "/products". */
export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

/** The origin of NEXT_PUBLIC_SITE_URL, or null when it is unset or invalid (Vercel previews, local development). */
export function configuredOrigin(value: string | undefined = process.env.NEXT_PUBLIC_SITE_URL): string | null {
  const configured = value?.trim();
  if (!configured) return null;
  try {
    return new URL(configured).origin;
  } catch {
    return null;
  }
}

/**
 * The origin visitors use to reach this app. Behind a reverse proxy (the container images) the
 * server only knows its own listening address, so the configured public origin wins; without one,
 * the origin of the request is used, as on Vercel.
 */
export function publicOrigin(requestOrigin: string, configured: string | null = configuredOrigin()): string {
  return configured ?? requestOrigin;
}
