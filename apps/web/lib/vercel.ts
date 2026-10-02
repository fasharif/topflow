/**
 * Whether the app was built and runs on Vercel, which sets VERCEL=1 for builds and functions.
 * Vercel Web Analytics and Speed Insights load their scripts from `/_vercel/...` paths that only
 * Vercel serves; in the container image (apps/web/Dockerfile) every page would request them and
 * get a 404, so the root layout renders them only here.
 */
export function onVercel(env: Record<string, string | undefined> = process.env): boolean {
  return env.VERCEL === '1';
}
