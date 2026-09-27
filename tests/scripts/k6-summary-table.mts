/**
 * Turns a k6 summary export (tests/reports/k6/summary-<profile>.json) into the Markdown table used
 * in docs/testing/PERFORMANCE.md. Run with Node 22.18 or later (types are stripped natively):
 *
 *   node tests/scripts/k6-summary-table.mts tests/reports/k6/summary-load.json
 *
 * Without a file it prints the table with every measurement marked as pending. For a smoke run the
 * Result column says "not judged (smoke)": its p95 is the slowest of a few requests, and the smoke
 * profile has no p95 thresholds (load/api-load.ts).
 */
import { readFileSync } from 'node:fs';

interface TrendMetric {
  med: number;
  'p(90)': number;
  'p(95)': number;
  max: number;
  count: number;
  /** The metric's thresholds as k6 evaluated them, keyed by expression. */
  thresholds?: Record<string, boolean>;
}

interface RateMetric {
  value: number;
  passes: number;
  fails: number;
  thresholds?: Record<string, boolean>;
}

interface SummaryExport {
  metrics: Record<string, TrendMetric | RateMetric>;
}

/**
 * Endpoints in the order the load test calls them, with their p95 targets in milliseconds, from the
 * file load/api-load.ts reads too. The result column compares the measured p95 with the target.
 */
export const ENDPOINTS = (
  JSON.parse(readFileSync(new URL('../load/targets.json', import.meta.url), 'utf8')) as {
    endpoints: ReadonlyArray<{ tag: string; label: string; p95Ms: number }>;
  }
).endpoints;

const ms = (value: number): string => `${value.toFixed(0)} ms`;

export function summaryTable(summary: SummaryExport | null): string {
  const rows = ENDPOINTS.map(({ tag, label, p95Ms }) => {
    const metric = summary?.metrics[`http_req_duration{endpoint:${tag}}`] as TrendMetric | undefined;
    const goal = `< ${p95Ms} ms`;
    if (!metric) return `| ${label} | pending | pending | pending | pending | ${goal} | pending |`;
    // Only the load profile gates on p95 (a p(95)< threshold); a smoke run's timings are not judged.
    const judged = Object.keys(metric.thresholds ?? {}).some((expression) => expression.startsWith('p(95)<'));
    const result = judged ? (metric['p(95)'] < p95Ms ? 'met' : 'missed') : 'not judged (smoke)';
    return `| ${label} | ${metric.count} | ${ms(metric.med)} | ${ms(metric['p(90)'])} | ${ms(metric['p(95)'])} | ${goal} | ${result} |`;
  });
  const failed = summary?.metrics.http_req_failed as RateMetric | undefined;
  const errors = failed ? `${(failed.value * 100).toFixed(2)} % of ${failed.passes + failed.fails} requests` : 'pending';
  return [
    '| Endpoint | Requests | Median | p90 | p95 | p95 target | Result |',
    '| --- | ---: | ---: | ---: | ---: | ---: | --- |',
    ...rows,
    '',
    `Failed requests: ${errors} (target below 1 %).`,
  ].join('\n');
}

const [file] = process.argv.slice(2);
console.log(summaryTable(file ? (JSON.parse(readFileSync(file, 'utf8')) as SummaryExport) : null));
