import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/site';

// Rendered per request, so a container image picks up NEXT_PUBLIC_SITE_URL from its runtime
// environment instead of the value present at build time.
export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/business', '/account', '/checkout', '/api'],
    },
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
