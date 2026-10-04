/**
 * Mutation check of the money rules and the concurrency guards in docs/testing/TEST-PLAN.md,
 * section 7. It makes one small change (a mutant) to the code at a time, runs the tests that should
 * notice it, and puts the file back. A mutant is killed when at least one of those tests fails; the
 * run fails if any survives. Before a mutant the tests run unchanged and must pass, so a failure is
 * the mutant's (mutants that share a command share that run).
 *
 * Run from the repository root with Node 22.18 or later, after `npm ci` and building the shared
 * packages (npx turbo run build --filter=@topflow/shared --filter=@topflow/database):
 *
 *   node tests/scripts/mutation-check.mts             the two decision-table mutants (unit tests)
 *   node tests/scripts/mutation-check.mts --with-db   also the locks and conditional writes, with the
 *                                                     API end-to-end suites against DATABASE_URL
 *                                                     (prepared as in CI)
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
  /** A Jest name pattern (-t) that narrows `command` to the tests written for this mutant. */
  tests?: string;
  needsDatabase?: boolean;
  /** Failures that show the defect the mutant stands for, counted from the failure messages. */
  symptom?: { label: string; pattern: RegExp };
}

const CONCURRENCY = ['run', 'test:e2e', '-w', '@topflow/api', '--', 'test/concurrency'];

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
  // The guards against two requests changing one record at the same moment (BUG-18 to BUG-22). Each
  // mutant removes one guard; the tests of apps/api/test/concurrency.e2e-spec.ts named in `tests`
  // must then fail.
  {
    name: 'BUG-18: the status condition removed from answers to a quotation',
    file: 'apps/api/src/procurement/quotations.service.ts',
    original: 'where: { ...extra, id, status },',
    mutated: 'where: { ...extra, id },',
    command: CONCURRENCY,
    tests: 'answers to one quotation',
    needsDatabase: true,
  },
  {
    name: 'BUG-18: the same condition, for a draft edited after it was sent',
    file: 'apps/api/src/procurement/quotations.service.ts',
    original: 'where: { ...extra, id, status },',
    mutated: 'where: { ...extra, id },',
    command: CONCURRENCY,
    tests: 'sent, then edited',
    needsDatabase: true,
  },
  {
    name: 'BUG-18: a revision supersedes earlier ones whatever their status',
    file: 'apps/api/src/procurement/quotations.service.ts',
    original: '\n          status: { in: OPEN_FOR_SUPERSEDE },',
    mutated: '',
    command: CONCURRENCY,
    tests: 'a revision sent while the earlier one is accepted',
    needsDatabase: true,
  },
  {
    name: 'BUG-18: a quotation is discarded whatever its status',
    file: 'apps/api/src/procurement/quotations.service.ts',
    original: 'where: { id, status: QuotationStatus.DRAFT },',
    mutated: 'where: { id },',
    command: CONCURRENCY,
    tests: 'sent, then discarded',
    needsDatabase: true,
  },
  {
    name: 'BUG-18: `FOR UPDATE` removed from the first draft of an RFQ',
    file: 'apps/api/src/procurement/quotations.service.ts',
    original: '\n          FOR UPDATE`;',
    mutated: '`;',
    command: CONCURRENCY,
    tests: 'first drafts for one RFQ',
    needsDatabase: true,
  },
  {
    name: 'BUG-19: the status and payment conditions removed from order changes',
    file: 'apps/api/src/orders/orders.service.ts',
    original: '\n        status: order.status,\n        paymentStatus: order.paymentStatus,',
    mutated: '',
    command: CONCURRENCY,
    tests: 'changes to one order',
    needsDatabase: true,
  },
  {
    name: 'BUG-20: `FOR UPDATE` removed from member changes',
    file: 'apps/api/src/organizations/organizations.service.ts',
    original: '\n      FOR UPDATE`;',
    mutated: '`;',
    command: CONCURRENCY,
    tests: 'owner changes',
    needsDatabase: true,
  },
  {
    name: 'BUG-21: the revocation condition removed from accepting an invitation',
    file: 'apps/api/src/organizations/invitations.service.ts',
    original: '\n          revokedAt: null,\n          expiresAt: { gt: new Date() },',
    mutated: '\n          expiresAt: { gt: new Date() },',
    command: CONCURRENCY,
    tests: 'an invitation revoked while it is accepted',
    needsDatabase: true,
  },
  {
    name: 'BUG-22: the status condition removed from cancelling an RFQ',
    file: 'apps/api/src/procurement/rfq.service.ts',
    original: 'where: { id, status: rfq.status },',
    mutated: 'where: { id },',
    command: CONCURRENCY,
    tests: 'an RFQ cancelled while sales close it',
    needsDatabase: true,
  },
  {
    name: 'BUG-22: the status condition removed from a change of legal identifier',
    file: 'apps/api/src/organizations/organizations.service.ts',
    original: '\n        ...(identifiersChanged && { status: current.status }),',
    mutated: '',
    command: CONCURRENCY,
    tests: 'a company profile edited while the company is suspended',
    needsDatabase: true,
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

const WINDOWS = process.platform === 'win32';

/** Runs a Jest command through npm and returns Jest's report. */
function runTests(command: string[], label: string): JestReport {
  const report = path.join(scratch, `${label}.json`);
  rmSync(report, { force: true });
  const result = spawnSync('npm', [...command, '--json', `--outputFile=${report}`], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: WINDOWS,
  });
  try {
    return JSON.parse(readFileSync(report, 'utf8')) as JestReport;
  } catch {
    process.stderr.write(`${result.stdout ?? ''}${result.stderr ?? ''}`);
    throw new Error(`npm ${command.join(' ')} produced no Jest report (exit code ${result.status}).`);
  }
}

/** The unchanged tests of each command, run once: mutants with the same command share the result. */
const unchanged = new Map<string, JestReport>();

function runUnchanged(command: string[], label: string): JestReport {
  const key = command.join(' ');
  const report = unchanged.get(key) ?? runTests(command, label);
  unchanged.set(key, report);
  return report;
}

/** The mutant's command, narrowed to its own tests. On Windows npm runs through a shell, which needs the quotes. */
function narrowed(mutant: Mutant): string[] {
  if (!mutant.tests) return mutant.command;
  return [...mutant.command, '-t', WINDOWS ? `"${mutant.tests}"` : mutant.tests];
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

    const before = runUnchanged(mutant.command, `${index}-before`);
    if (before.numFailedTests > 0) {
      process.stderr.write(`${failureMessages(before).join('\n\n')}\n`);
      throw new Error(`${mutant.name}: ${before.numFailedTests} test(s) fail before any change; fix them first.`);
    }

    restore.set(file, source);
    writeFileSync(file, source.replace(mutant.original, mutant.mutated));
    let after: JestReport;
    try {
      after = runTests(narrowed(mutant), `${index}-after`);
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
