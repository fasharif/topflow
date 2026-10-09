import { formatMoney, type DocumentLineDto, type OrderDto, type QuotationDto } from '@topflow/shared';
import type { Page } from '@playwright/test';
import { SEEDED, customerOrderId, organizationOrderId, organizationQuotationId, staffOrderId, staffQuotationId } from '../support/data';
import { expect, test } from '../support/fixtures';
import { open } from '../support/page';

// At an ordinary desktop size the priced lines of orders and quotations must show every money
// column: at 1280 × 720 the line totals of these pages were cut off behind a sideways scroll, next
// to the pages' side panels (BUG-14 in docs/testing/BUGS-FOUND.md).

const VIEWPORT = { width: 1280, height: 720 };
test.use({ viewport: VIEWPORT });

/** Horizontal scroll containers on the page whose content is wider than they are. */
function sidewaysScrolled(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('.overflow-x-auto'))
      .filter((element) => element.offsetParent !== null && element.scrollWidth > element.clientWidth + 1)
      .map((element) => element.getAttribute('aria-label') ?? element.className),
  );
}

/** Every line's total is shown, inside the window, and nothing on the page scrolls sideways. */
async function expectAllMoneyInView(page: Page, name: string, lines: DocumentLineDto[]): Promise<void> {
  expect(await sidewaysScrolled(page), `${name}: content hidden behind a sideways scroll`).toEqual([]);
  for (const line of lines) {
    const total = page.getByText(formatMoney(line.lineTotal), { exact: true }).filter({ visible: true }).first();
    await total.scrollIntoViewIfNeeded();
    const box = await total.boundingBox();
    expect(box, `${name}: total of ${line.sku}`).not.toBeNull();
    expect(box!.x + box!.width, `${name}: total of ${line.sku} ends inside the window`).toBeLessThanOrEqual(VIEWPORT.width);
  }
}

test.describe('layout: a table is a tab stop only while it scrolls', () => {
  // BUG-01 made wide tables focusable so keyboard users can scroll them; its follow-up keeps a table
  // that fits from becoming a tab stop and a landmark. Nothing else checks the fitting case.
  test('the customer’s orders table at desktop and at phone width', async ({ actAs }) => {
    const { page } = await actAs('customer');
    await open(page, '/account/orders');
    const region = page.locator('.overflow-x-auto', { has: page.locator('table') });
    await expect(region).toHaveCount(1);
    const overflows = () => region.evaluate((element) => element.scrollWidth > element.clientWidth);

    await test.step('at 1280 × 720 the table fits: no tab stop, no region', async () => {
      expect(await overflows(), 'the table fits at 1280 px').toBe(false);
      await expect(region).not.toHaveAttribute('tabindex');
      await expect(region).not.toHaveAttribute('role');
      await expect(region).not.toHaveAttribute('aria-label');
    });

    await test.step('at phone width it scrolls: a named region that takes keyboard focus', async () => {
      await page.setViewportSize({ width: 412, height: 915 });
      await expect.poll(overflows, { message: 'the table scrolls sideways at 412 px' }).toBe(true);
      await expect(region).toHaveAttribute('tabindex', '0');
      await expect(region).toHaveAttribute('role', 'region');
      await expect(region).toHaveAttribute('aria-label', 'Your orders');
      await region.focus();
      await expect(page.getByRole('region', { name: 'Your orders' })).toBeFocused();
    });

    await test.step('back at 1280 px it is a plain box again', async () => {
      await page.setViewportSize(VIEWPORT);
      await expect(region).not.toHaveAttribute('tabindex');
      await expect(region).not.toHaveAttribute('role');
    });
  });
});

test.describe('layout: money columns fit at 1280 px', () => {
  test('customer order pages', async ({ actAs }) => {
    const { page, api } = await actAs('customer');
    for (const number of [SEEDED.confirmedRetailOrder, SEEDED.deliveredRetailOrder]) {
      const id = await customerOrderId(api, number);
      const order = await api.get<OrderDto>(`/me/orders/${id}`);
      await open(page, `/account/orders/${id}`);
      await expectAllMoneyInView(page, number, order.items);
    }
  });

  test('trade portal quotation and order', async ({ actAs }) => {
    const { page, api } = await actAs('approver');
    const organizationId = await api.organizationId();
    const quotationId = await organizationQuotationId(api, organizationId, SEEDED.pendingApprovalQuotation);
    const quotation = await api.get<QuotationDto>(`/org/quotations/${quotationId}`, { organizationId });
    await open(page, `/business/quotations/${quotationId}`);
    await expect(page.getByText('Your approval is needed')).toBeVisible();
    await expectAllMoneyInView(page, SEEDED.pendingApprovalQuotation, quotation.items);

    const orderId = await organizationOrderId(api, organizationId, SEEDED.tradeOrderInProgress);
    const order = await api.get<OrderDto>(`/org/orders/${orderId}`, { organizationId });
    await open(page, `/business/orders/${orderId}`);
    await expectAllMoneyInView(page, SEEDED.tradeOrderInProgress, order.items);
  });

  test('back-office order and quotation', async ({ actAs }) => {
    const { page, api } = await actAs('admin');
    const orderId = await staffOrderId(api, SEEDED.tradeOrderInProgress);
    const order = await api.get<OrderDto>(`/admin/orders/${orderId}`);
    await open(page, `/admin/orders/${orderId}`);
    await expectAllMoneyInView(page, `back office ${SEEDED.tradeOrderInProgress}`, order.items);

    const quotationId = await staffQuotationId(api, SEEDED.openQuotation);
    const quotation = await api.get<QuotationDto>(`/admin/quotations/${quotationId}`);
    await open(page, `/admin/quotations/${quotationId}`);
    await expectAllMoneyInView(page, `back office ${SEEDED.openQuotation}`, quotation.items);
  });
});
