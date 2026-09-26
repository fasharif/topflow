/**
 * TopFlow Hub is Farah Sharif's portfolio project, built with Top Flow's permission (ADR-023). Every
 * page of every build says so and asks search engines not to index it, so no deployment of this
 * repository can pass for Top Flow's official store. It is deliberately not a setting: a runtime
 * flag could be left off in one environment, and a build-time one would split the single web image.
 */
export const PORTFOLIO_NOTICE = 'Portfolio project by Farah Sharif, built with Top Flow’s permission. This is not Top Flow’s official store.';

/** Sent as the X-Robots-Tag header with every response (next.config.ts) and as the robots meta tag. */
export const ROBOTS_DIRECTIVE = 'noindex, nofollow';
