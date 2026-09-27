/**
 * Checks that the k6 load profile fails a run on every p95 target in load/targets.json, and on
 * failed requests and checks. CI runs only the smoke profile, which has no p95 thresholds, so this
 * is what keeps the load profile's gates from disappearing unnoticed. Reads the options that
 * `k6 inspect` prints for the load profile (load/check-thresholds.sh runs both):
 *
 *   k6 inspect -e K6_PROFILE=load api-load.ts | node tests/scripts/k6-thresholds.mts
 */
import { readFileSync } from 'node:fs';

interface Target {
  tag: string;
  label: string;
  p95Ms: number;
}

const targets = (JSON.parse(readFileSync(new URL('../load/targets.json', import.meta.url), 'utf8')) as { endpoints: Target[] }).endpoints;

/** Expected threshold expressions per metric. */
export function expectedThresholds(endpoints: readonly Target[]): Array<[metric: string, expression: string]> {
  return [
    ['http_req_failed', 'rate<0.01'],
    ['checks', 'rate>0.99'],
    ...endpoints.map(({ tag, p95Ms }): [string, string] => [`http_req_duration{endpoint:${tag}}`, `p(95)<${p95Ms}`]),
  ];
}

/** The expected thresholds that the inspected options lack, as readable lines. */
export function missingThresholds(options: { thresholds?: Record<string, string[]> }, endpoints: readonly Target[]): string[] {
  const thresholds = options.thresholds ?? {};
  return expectedThresholds(endpoints)
    .filter(([metric, expression]) => !(thresholds[metric] ?? []).includes(expression))
    .map(([metric, expression]) => `${metric}: ${expression}`);
}

const input = readFileSync(0, 'utf8');
const missing = missingThresholds(JSON.parse(input) as { thresholds?: Record<string, string[]> }, targets);
if (missing.length > 0) {
  console.error(`The k6 load profile does not gate on:\n${missing.map((line) => `  ${line}`).join('\n')}`);
  process.exit(1);
}
console.log(`The k6 load profile gates on failed requests, checks and ${targets.length} p95 targets.`);
