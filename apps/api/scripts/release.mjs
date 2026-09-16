// Release step of the API's Vercel build. Production deployments validate the environment and
// apply database migrations before the new version receives traffic, so a misconfigured release
// fails the build and the previous deployment keeps serving. Preview deployments never migrate.
import { spawnSync } from 'node:child_process';

const environment = process.env.VERCEL_ENV ?? 'local';

if (environment !== 'production') {
  console.log(`Release: skipping database migrations for the ${environment} environment.`);
  process.exit(0);
}

// `npm run release` (repository root): environment preflight, then `prisma migrate deploy`.
const result = spawnSync('npm', ['run', 'release'], { stdio: 'inherit', shell: process.platform === 'win32' });
process.exit(result.status ?? 1);
