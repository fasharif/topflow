/**
 * TopFlow Hub is Farah Sharif's portfolio project, built with Top Flow's permission (ADR-023). Every
 * page of every build says so and asks search engines not to index it, so no deployment of this
 * repository can pass for Top Flow's official store. It is deliberately not a setting: a runtime
 * flag could be left off in one environment, and a build-time one would split the single web image.
 *
 * An ordinary build says it with the portfolio notice below. A demo build (NEXT_PUBLIC_DEMO_MODE,
 * ADR-021) shows the demo banner in its place, which says the same and adds the nightly reset, so a
 * page never carries both. Search engines are kept out the same way in both.
 */
export const PORTFOLIO_NOTICE = 'Portfolio project by Farah Sharif, built with Top Flow’s permission. This is not Top Flow’s official store.';

/**
 * Sent as the X-Robots-Tag header with every response (next.config.ts) and as the robots meta tag of
 * every page (lib/site-metadata.ts). robots.txt (app/robots.ts) blocks nothing, because a crawler
 * that may not fetch a page never sees its noindex and can still list the bare address.
 */
export const ROBOTS_DIRECTIVE = 'noindex, nofollow';
