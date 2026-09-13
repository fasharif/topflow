import type { NextConfig } from 'next';

/**
 * The browser talks to the API through this app's own origin (`/api/*` → NestJS). Keeping
 * the API same-origin means the httpOnly refresh-token cookie is a first-party cookie (no
 * third-party cookie restrictions) and no CORS preflights are needed.
 */
const apiOrigin = (process.env.API_INTERNAL_URL ?? 'http://localhost:3000').replace(/\/$/, '');

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiOrigin}/:path*` }];
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
