/**
 * Summarises the Schemathesis passes of one run (tests/reports/schemathesis/run-<pass>.json, written
 * by contract/run-schemathesis.sh) as a Markdown table, including the warnings that say how much of
 * the API the generated requests actually reached. Run with Node 22.18 or later:
 *
 *   node tests/scripts/schemathesis-summary.mts tests/reports/schemathesis
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

interface RunReport {
  schemathesis_version: string;
  seed: number;
  operations: { total: number; tested: number };
  test_cases: { generated: number; with_failures: number; unique_failures: number };
  baseline?: { known: number; new: number };
  warnings: Partial<Record<'missing_auth' | 'missing_test_data' | 'validation_mismatch', string[]>>;
}

export const PASSES = ['customer', 'staff', 'trade'] as const;

const count = (list: string[] | undefined): number => list?.length ?? 0;

export function summaryTable(reports: Array<[string, RunReport]>): string {
  const rows = reports.map(([pass, report]) => {
    const { operations, test_cases: cases, warnings } = report;
    return [
      pass,
      `${operations.tested} of ${operations.total}`,
      cases.generated.toLocaleString('en-GB'),
      String(cases.unique_failures),
      String(report.baseline?.known ?? 0),
      String(count(warnings.missing_auth)),
      String(count(warnings.missing_test_data)),
      String(count(warnings.validation_mismatch)),
    ];
  });
  const [first] = reports;
  return [
    '| Pass | Operations tested | Test cases | New failures | Known (baseline) | Only 401/403 | Repeated 404 | Mostly rejected |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...rows.map((cells) => `| ${cells.join(' | ')} |`),
    '',
    first ? `Schemathesis ${first[1].schemathesis_version}, seed ${first[1].seed}.` : 'No Schemathesis report found.',
  ].join('\n');
}

const [directory = 'tests/reports/schemathesis'] = process.argv.slice(2);
const reports = PASSES.map((pass) => [pass, path.join(directory, `run-${pass}.json`)] as const)
  .filter(([, file]) => existsSync(file))
  .map(([pass, file]) => [pass, JSON.parse(readFileSync(file, 'utf8')) as RunReport] as [string, RunReport]);
console.log(summaryTable(reports));
