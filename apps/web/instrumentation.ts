/**
 * Runs once when a server instance starts, before it serves a request. Loading the demo setting here
 * validates NEXT_PUBLIC_DEMO_MODE at boot, like the API validates its environment.
 */
export async function register(): Promise<void> {
  await import('./lib/demo');
}
