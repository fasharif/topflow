export interface WebHealth {
  status: 'ok';
  /** Build identifier of the running image (APP_VERSION), or null outside a container build. */
  version: string | null;
  uptimeSeconds: number;
}

export function webHealth(env: Record<string, string | undefined> = process.env): WebHealth {
  return {
    status: 'ok',
    version: env.APP_VERSION?.trim() || null,
    uptimeSeconds: Math.round(process.uptime()),
  };
}
