/**
 * Product photos are served by the Top Flow web app, not the API. The catalogue stores most of them
 * as site-relative paths (e.g. `/catalog/products/y-type-disc-filter.webp`), which are resolved
 * against `EXPO_PUBLIC_WEB_URL`. Absolute http(s) URLs are used as they are.
 */

// Must be referenced statically (dot notation) so Expo inlines it at build time.
const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL ?? '').trim().replace(/\/+$/, '');

const HTTP_URL = /^https?:\/\//i;
const URL_SCHEME = /^[a-z][a-z\d+.-]*:/i;

/**
 * The URL to load for a catalogue `imageUrl`, or `null` when there is nothing loadable and the
 * caller should show its placeholder: no image, a relative path while `EXPO_PUBLIC_WEB_URL` is not
 * set, or a URL with a scheme other than http(s).
 */
export function resolveImageUrl(imageUrl: string | null | undefined): string | null {
  const value = imageUrl?.trim();
  if (!value) return null;
  if (HTTP_URL.test(value)) return value;
  if (value.startsWith('//')) return `https:${value}`;
  if (URL_SCHEME.test(value) || !WEB_URL) return null;
  return `${WEB_URL}/${value.replace(/^\/+/, '')}`;
}
