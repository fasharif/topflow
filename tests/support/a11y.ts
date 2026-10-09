import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo } from '@playwright/test';

/** WCAG 2.2 level A and AA rules (axe-core tags). */
export const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** Impacts that fail the build. Moderate and minor findings are attached to the report only. */
const BLOCKING = new Set(['serious', 'critical']);

type Violation = Awaited<ReturnType<AxeBuilder['analyze']>>['violations'][number];

function describe(violations: Violation[]): string {
  return violations
    .map((violation) => {
      const targets = violation.nodes
        .slice(0, 5)
        .map((node) => `    - ${node.target.join(' ')}`)
        .join('\n');
      return `${violation.impact}: ${violation.id} — ${violation.help} (${violation.helpUrl})\n${targets}`;
    })
    .join('\n');
}

/**
 * Runs axe-core against the current page, attaches every finding to the HTML report and records a
 * failure for serious or critical WCAG 2.2 A/AA violations. The check is soft, so one test can scan
 * several pages and report all of them before it fails.
 */
export async function expectAccessible(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  await testInfo.attach(`axe — ${name}`, {
    body: JSON.stringify({ url: page.url(), violations: results.violations }, null, 2),
    contentType: 'application/json',
  });
  const blocking = results.violations.filter((violation) => BLOCKING.has(violation.impact ?? ''));
  expect.soft(blocking, `Serious or critical accessibility violations on ${name}:\n${describe(blocking)}`).toEqual([]);
}
