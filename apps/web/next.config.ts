import path from 'node:path';
import type { NextConfig } from 'next';

/**
 * Browser requests reach the NestJS API through app/api/[...path]/route.ts, which attaches the
 * Supabase session from httpOnly cookies on this server, so no rewrites are needed.
 */
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  ...(process.env.NODE_ENV === 'production'
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Container builds (apps/web/Dockerfile) emit a self-contained server with only the files it
  // needs. Tracing starts at the monorepo root so workspace packages such as @topflow/shared are
  // included. Vercel and `next start` use the default output.
  ...(process.env.NEXT_OUTPUT === 'standalone' && {
    output: 'standalone',
    outputFileTracingRoot: path.join(__dirname, '../..'),
  }),
  async headers() {
    // noindex: a portfolio project stays out of search results (lib/portfolio.ts, ADR-023).
    return [{ source: '/:path*', headers: [...securityHeaders, { key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }];
  },
};

export default nextConfig;
