// Prints the API's test coverage as a Markdown table, for the CI job summary:
//
//   node apps/api/scripts/coverage-summary.mjs >> "$GITHUB_STEP_SUMMARY"
//
// It reads the json-summary reports of `npm run test:cov` (coverage/unit) and
// `npm run test:e2e:cov` (coverage/e2e), and skips a suite that has not been run.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SUITES = [
  ['Unit tests', 'unit'],
  ['End-to-end tests', 'e2e'],
];
const METRICS = ['statements', 'branches', 'functions', 'lines'];

const rows = SUITES.flatMap(([label, folder]) => {
  const file = fileURLToPath(
    new URL(`../coverage/${folder}/coverage-summary.json`, import.meta.url),
  );
  if (!existsSync(file)) return [];
  const { total } = JSON.parse(readFileSync(file, 'utf8'));
  const cells = METRICS.map(
    (metric) =>
      `${total[metric].pct.toFixed(1)} % (${total[metric].covered}/${total[metric].total})`,
  );
  return [`| ${label} | ${cells.join(' | ')} |`];
});

if (rows.length === 0) {
  console.error(
    'No coverage reports found: run npm run test:cov or npm run test:e2e:cov first.',
  );
  process.exit(1);
}

console.log(
  [
    '### API test coverage',
    '',
    '| Suite | Statements | Branches | Functions | Lines |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...rows,
  ].join('\n'),
);
