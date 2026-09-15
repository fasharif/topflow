/**
 * Release-phase guard that runs before database migrations (`npm run release`, used by the
 * Dockerfile and by Railway's pre-deploy command). It validates the environment exactly as the
 * API does at boot, so a misconfigured deployment stops here — before any migration touches the
 * database — and the previous release keeps serving traffic.
 */
import 'dotenv/config';
import { loadConfig } from './config/env';

try {
  const config = loadConfig();
  console.log(
    `Environment OK: ${config.env}, API v${config.app.version} on port ${config.port}`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
