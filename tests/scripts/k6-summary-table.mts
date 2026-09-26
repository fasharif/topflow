/**
 * Turns a k6 summary export (tests/reports/k6/summary-<profile>.json) into the Markdown table used
 * in docs/testing/PERFORMANCE.md. Run with Node 22.18 or later (types are stripped natively):
 *
 *   node tests/scripts/k6-summary-table.mts tests/reports/k6/summary-load.json
 *
 * Without a file it prints the table with every measurement marked as pending.
 */
import { readFileSync } from 'node:fs';

interface TrendMetric {
  med: number;
  'p(90)': number;
  'p(95)': number;
  max: number;
  count: number;
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
 * Endpoints in the order the load test calls them, with the p95 target in milliseconds from
 * P95_TARGETS_MS in load/api-load.ts. The result column compares the measured p95 with the target
 * itself, because only the load profile turns the targets into thresholds.
 */
export const ENDPOINTS: ReadonlyArray<{ tag: string; label: string; targetMs: number }> = [
  { tag: 'health', label: 'GET /health/ready', targetMs: 200 },
  { tag: 'categories', label: 'GET /catalog/categories', targetMs: 500 },
  { tag: 'catalogue', label: 'GET /catalog/products (page)', targetMs: 500 },
  { tag: 'search', label: 'GET /catalog/products?search=', targetMs: 500 },
  { tag: 'product', label: 'GET /catalog/products/{slug}', targetMs: 500 },
  { tag: 'me', label: 'GET /auth/me', targetMs: 500 },
  { tag: 'my-orders', label: 'GET /me/orders', targetMs: 500 },
  { tag: 'quote-request', label: 'POST /quote-requests', targetMs: 1000 },
];

const ms = (value: number): string => `${value.toFixed(0)} ms`;

export function summaryTable(summary: SummaryExport | null): string {
  const rows = ENDPOINTS.map(({ tag, label, targetMs }) => {
    const metric = summary?.metrics[`http_req_duration{endpoint:${tag}}`] as TrendMetric | undefined;
    const goal = `< ${targetMs} ms`;
    if (!metric) return `| ${label} | pending | pending | pending | pending | ${goal} | pending |`;
    const met = metric['p(95)'] < targetMs;
    return `| ${label} | ${metric.count} | ${ms(metric.med)} | ${ms(metric['p(90)'])} | ${ms(metric['p(95)'])} | ${goal} | ${met ? 'met' : 'missed'} |`;
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
