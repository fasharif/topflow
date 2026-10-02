import { webHealth } from '@/lib/health';

// Evaluated per request, so the version reflects the running image.
export const dynamic = 'force-dynamic';

/**
 * Liveness of the web server for container health checks, load balancers and uptime monitors.
 * It never calls the API or Supabase, so a dependency outage does not restart healthy web servers.
 */
export function GET(): Response {
  return Response.json(webHealth(), { headers: { 'cache-control': 'no-store' } });
}
