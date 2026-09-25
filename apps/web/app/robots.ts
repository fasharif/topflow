import type { MetadataRoute } from 'next';
import { DEMO_MODE } from '@/lib/demo';
import { absoluteUrl } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  // The portfolio demo stays out of search engines entirely.
  if (DEMO_MODE) return { rules: { userAgent: '*', disallow: '/' } };
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/business', '/account', '/checkout', '/api'],
    },
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
