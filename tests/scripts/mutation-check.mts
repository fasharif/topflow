/**
 * Mutation check of the money rules in docs/testing/TEST-PLAN.md, section 7. It makes one small
 * change (a mutant) to the code at a time, runs the tests that should notice it, and puts the file
 * back. A mutant is killed when at least one of those tests fails; the run fails if any survives.
 * Before each mutant the same tests run once unchanged and must pass, so a failure is the mutant's.
 *
 * Run from the repository root with Node 22.18 or later, after `npm ci` and building the shared
 * packages (npx turbo run build --filter=@topflow/shared --filter=@topflow/database):
 *
 *   node tests/scripts/mutation-check.mts             the two decision-table mutants (unit tests)
 *   node tests/scripts/mutation-check.mts --with-db   also the row lock, with the API end-to-end
 *                                                     suite against DATABASE_URL (prepared as in CI)
 *
 * It prints a Markdown table. The working tree must not have uncommitted changes to the mutated
 * files; they are restored even when the run is interrupted.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

interface Mutant {
  name: string;
  /** Relative to the repository root. */
  file: string;
  original: string;
  mutated: string;
  /** npm arguments that run the tests expected to catch the mutant; Jest options are appended. */
  command: string[];
  needsDatabase?: boolean;
  /** Failures that show the defect the mutant stands for, counted from the failure messages. */
  symptom?: { label: string; pattern: RegExp };
}

const MUTANTS: Mutant[] = [
  {
    name: 'Table A: `>` becomes `>=` in `requiresApproval`',
    file: 'packages/shared/src/workflows/approval.ts',
    original: 'return amountFils > ctx.approvalLimitFils;',
    mutated: 'return amountFils >= ctx.approvalLimitFils;',
    command: ['test', '-w', '@topflow/shared', '--', 'approval'],
  },
  {
    name: 'Table B: `<=` becomes `<` in the OrderWriter credit check',
    file: 'apps/api/src/orders/order-writer.service.ts',
    original: 'if (exposureFils <= toFils(terms.creditLimit)) {',
    mutated: 'if (exposureFils < toFils(terms.creditLimit)) {',
    command: ['test', '-w', '@topflow/api', '--', 'order-writer'],
  },
  {
    name: 'BUG-13: `FOR UPDATE` removed from the credit release',
    file: 'apps/api/src/orders/order-writer.service.ts',
    original: '\n        FOR UPDATE`;',
    mutated: '`;',
    command: ['run', 'test:e2e', '-w', '@topflow/api', '--', '-t', 'concurrency', 'test/decision-tables'],
    needsDatabase: true,
    symptom: { label: 'rounds that released both orders on credit', pattern: /Received length: 2/ },
  },
];

interface JestReport {
  numPassedTests: number;
  numFailedTests: number;
  testResults: Array<{ assertionResults: Array<{ status: string; failureMessages: string[] }> }>;
}

const scratch = mkdtempSync(path.join(tmpdir(), 'mutation-check-'));
const restore = new Map<string, string>();

function restoreAll(): void {
  for (const [file, content] of restore) writeFileSync(file, content);
  restore.clear();
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    restoreAll();
    process.exit(130);
  });
}

/** Runs the mutant's tests and returns Jest's report. */
function runTests(mutant: Mutant, label: string): JestReport {
  const report = path.join(scratch, `${label}.json`);
  rmSync(report, { force: true });
  const result = spawnSync('npm', [...mutant.command, '--json', `--outputFile=${report}`], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  try {
    return JSON.parse(readFileSync(report, 'utf8')) as JestReport;
  } catch {
    process.stderr.write(`${result.stdout ?? ''}${result.stderr ?? ''}`);
    throw new Error(`npm ${mutant.command.join(' ')} produced no Jest report (exit code ${result.status}).`);
  }
}

function failureMessages(report: JestReport): string[] {
  return report.testResults.flatMap((file) =>
    file.assertionResults.filter((test) => test.status === 'failed').flatMap((test) => test.failureMessages.join('\n')),
  );
}

const withDatabase = process.argv.includes('--with-db');
if (withDatabase && !process.env.DATABASE_URL) {
  console.error('--with-db needs DATABASE_URL, prepared as in CI (db:deploy, db:seed and the demo reset).');
  process.exit(1);
}

const rows: string[] = [];
let survived = 0;
try {
  for (const [index, mutant] of MUTANTS.entries()) {
    if (mutant.needsDatabase && !withDatabase) {
      rows.push(`| ${mutant.name} | not run (needs \`--with-db\`) | | |`);
      continue;
    }
    const file = path.join(ROOT, mutant.file);
    const source = readFileSync(file, 'utf8');
    if (source.split(mutant.original).length !== 2) {
      throw new Error(`${mutant.file} no longer contains exactly one ${JSON.stringify(mutant.original)}; update the mutant.`);
    }

    const before = runTests(mutant, `${index}-before`);
    if (before.numFailedTests > 0) throw new Error(`${mutant.name}: ${before.numFailedTests} test(s) fail before any change; fix them first.`);

    restore.set(file, source);
    writeFileSync(file, source.replace(mutant.original, mutant.mutated));
    let after: JestReport;
    try {
      after = runTests(mutant, `${index}-after`);
    } finally {
      restoreAll();
    }

    const run = after.numPassedTests + after.numFailedTests;
    const killed = after.numFailedTests > 0;
    if (!killed) survived++;
    const symptom = mutant.symptom
      ? `; ${failureMessages(after).filter((message) => mutant.symptom!.pattern.test(message)).length} ${mutant.symptom.label}`
      : '';
    rows.push(`| ${mutant.name} | ${run} | ${after.numFailedTests}${symptom} | ${killed ? 'killed' : '**survived**'} |`);
  }
} finally {
  restoreAll();
  rmSync(scratch, { recursive: true, force: true });
}

console.log(['| Mutant | Tests run | Failed | Result |', '| --- | ---: | --- | --- |', ...rows].join('\n'));
process.exit(survived > 0 ? 1 : 0);
