import type { MetadataRoute } from 'next';

/**
 * Every build, demo or not, stays out of search engines through noindex: the robots meta tag on every
 * page and the X-Robots-Tag header on every response (lib/portfolio.ts, ADR-023). robots.txt must let
 * crawlers fetch the pages to read it: a page blocked here is never fetched, so its noindex is never
 * seen and its address can still be listed from links elsewhere. For the same reason no sitemap is
 * offered: this site asks for none of its pages to be indexed.
 */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', allow: '/' } };
}
