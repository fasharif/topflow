/**
 * Turns a k6 summary export (tests/reports/k6/summary-<profile>.json) into the Markdown table used
 * in docs/testing/PERFORMANCE.md. Run with Node 22.18 or later (types are stripped natively):
 *
 *   node tests/scripts/k6-summary-table.mts tests/reports/k6/summary-load.json
 *
 * Per endpoint it prints the requests, their rate over the whole run, the failed share, and the
 * median (p50), p90 and p95 durations; below the table, the totals. Without a file it prints the
 * table with every measurement marked as pending. For a smoke run the Result column says
 * "not judged (smoke)": its p95 is the slowest of a few requests, and the smoke profile has no p95
 * thresholds (load/api-load.ts).
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

/** A k6 rate in the summary export: `passes` counts the true values (for http_req_failed, failures). */
interface RateMetric {
  value: number;
  passes: number;
  fails: number;
  thresholds?: Record<string, boolean>;
}

interface CounterMetric {
  count: number;
  rate: number;
}

interface SummaryExport {
  metrics: Record<string, TrendMetric | RateMetric | CounterMetric>;
}

/**
 * Endpoints in the order the load test calls them, with their p95 thresholds in milliseconds, from
 * the file load/api-load.ts reads too. The result column compares the measured p95 with it.
 */
export const ENDPOINTS = (
  JSON.parse(readFileSync(new URL('../load/targets.json', import.meta.url), 'utf8')) as {
    endpoints: ReadonlyArray<{ tag: string; label: string; p95Ms: number }>;
  }
).endpoints;

/** Whole milliseconds, with one decimal below 10 ms, where a rounding step would be a large share. */
const ms = (value: number): string => `${value < 10 ? value.toFixed(1) : value.toFixed(0)} ms`;
/** Two decimals, never rounded to 0 or 100 when the rate is not exactly that (1 failure in 24,352 requests). */
export function percent(rate: Pick<RateMetric, 'value'>): string {
  const value = rate.value * 100;
  if (value > 0 && value < 0.005) return '< 0.01 %';
  if (value < 100 && value >= 99.995) return '> 99.99 %';
  return `${value.toFixed(2)} %`;
}
const perSecond = (count: number, seconds: number): string => (count / seconds).toFixed(count / seconds < 10 ? 2 : 1);

export function summaryTable(summary: SummaryExport | null): string {
  const requests = summary?.metrics.http_reqs as CounterMetric | undefined;
  // The export has no run duration; http_reqs gives it, as its rate is the count over the run.
  const seconds = requests && requests.rate > 0 ? requests.count / requests.rate : undefined;

  const rows = ENDPOINTS.map(({ tag, label, p95Ms }) => {
    const metric = summary?.metrics[`http_req_duration{endpoint:${tag}}`] as TrendMetric | undefined;
    const failed = summary?.metrics[`http_req_failed{endpoint:${tag}}`] as RateMetric | undefined;
    const goal = `< ${p95Ms} ms`;
    if (!metric) return `| ${label} | pending | pending | pending | pending | pending | pending | ${goal} | pending |`;
    // Only the load profile gates on p95 (a p(95)< threshold); a smoke run's timings are not judged.
    const judged = Object.keys(metric.thresholds ?? {}).some((expression) => expression.startsWith('p(95)<'));
    const result = judged ? (metric['p(95)'] < p95Ms ? 'met' : 'missed') : 'not judged (smoke)';
    const rate = seconds ? perSecond(metric.count, seconds) : 'n/a';
    return `| ${label} | ${metric.count} | ${rate} | ${failed ? percent(failed) : 'n/a'} | ${ms(metric.med)} | ${ms(metric['p(90)'])} | ${ms(metric['p(95)'])} | ${goal} | ${result} |`;
  });

  const failed = summary?.metrics.http_req_failed as RateMetric | undefined;
  const checks = summary?.metrics.checks as RateMetric | undefined;
  const totals =
    requests && seconds && failed && checks
      ? [
          `All requests, including set-up and sign-ins: ${requests.count} in ${seconds.toFixed(0)} s, ${perSecond(requests.count, seconds)} per second.`,
          `Failed requests: ${percent(failed)} (${failed.passes} of ${failed.passes + failed.fails}; threshold below 1 % overall and per endpoint).`,
          `Checks passed: ${percent(checks)} (${checks.passes} of ${checks.passes + checks.fails}; threshold above 99 %).`,
        ]
      : ['Failed requests: pending (threshold below 1 % overall and per endpoint).', 'Checks passed: pending (threshold above 99 %).'];

  return [
    '| Endpoint | Requests | Per second | Failed | Median (p50) | p90 | p95 | p95 threshold | Result |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
    ...rows,
    '',
    ...totals.flatMap((line, index) => (index === 0 ? [line] : ['', line])),
  ].join('\n');
}

const [file] = process.argv.slice(2);
console.log(summaryTable(file ? (JSON.parse(readFileSync(file, 'utf8')) as SummaryExport) : null));
