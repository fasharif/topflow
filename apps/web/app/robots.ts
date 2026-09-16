import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/site';

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
