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
