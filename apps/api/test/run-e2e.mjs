// Runs the end-to-end suite with Node's VM-modules support enabled. Prisma 7 loads its
// query compiler through a dynamic import(), which Jest only allows when Node is started
// with --experimental-vm-modules. A launcher keeps the npm script cross-platform.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const jest = require.resolve('jest/bin/jest');

const result = spawnSync(
  process.execPath,
  ['--experimental-vm-modules', '--no-warnings=ExperimentalWarning', jest, '--config', 'test/jest-e2e.json', '--runInBand', ...process.argv.slice(2)],
  { stdio: 'inherit' },
);

process.exit(result.status ?? 1);
