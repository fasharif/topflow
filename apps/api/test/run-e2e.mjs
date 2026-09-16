// Runs the end-to-end suite with Node's VM-modules support enabled. Prisma 7 loads its query
// compiler through a dynamic import(), which Jest only allows when Node is started with
// --experimental-vm-modules. A launcher keeps the npm script cross-platform.
//
// In that mode Jest loads every .js file of a "type": "module" package as native ESM, which breaks
// ESM-only dependencies required from the CommonJS test build (jose). The launcher therefore
// bundles jose into a CommonJS file first; jest-e2e.json maps the package to that bundle.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';

const require = createRequire(import.meta.url);

buildSync({
  entryPoints: [require.resolve('jose')],
  outfile: fileURLToPath(new URL('./.cache/jose.cjs', import.meta.url)),
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node22',
  logLevel: 'error',
});

const jest = require.resolve('jest/bin/jest');
const result = spawnSync(
  process.execPath,
  ['--experimental-vm-modules', '--no-warnings=ExperimentalWarning', jest, '--config', 'test/jest-e2e.json', '--runInBand', ...process.argv.slice(2)],
  { stdio: 'inherit' },
);

process.exit(result.status ?? 1);
