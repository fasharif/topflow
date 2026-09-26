import { expectAccessible } from '../support/a11y';
import { AL_WAHA, DEMO_ACCOUNTS, DESERT_BLOOM } from '../support/accounts';
import {
  PRODUCTS,
  SEEDED,
  customerOrderId,
  organizationByName,
  organizationOrderId,
  organizationQuotationId,
  organizationRfqId,
  productBySku,
  staffOrderId,
  staffQuotationId,
  staffRfqId,
} from '../support/data';
import { expect, test } from '../support/fixtures';
import { open } from '../support/page';

// Every key page is scanned with axe-core against WCAG 2.2 A and AA. Serious and critical
// violations fail the test; all findings are attached to the HTML report. Each test scans the
// pages of one audience, signed in as the matching demo account.

test.describe('accessibility (axe-core, WCAG 2.2 A/AA)', () => {
  test('storefront and sign-in pages', async ({ actAs }, testInfo) => {
    const { page, api } = await actAs('customer');
    const product = await productBySku(api, PRODUCTS.fitting);
    await page.context().clearCookies();

    const pages: Array<[string, string]> = [
      ['home page', '/'],
      ['catalogue', '/products'],
      ['catalogue search', `/products?search=${encodeURIComponent('drip')}`],
      ['product page', `/products/${product.slug}`],
      ['empty basket', '/cart'],
      ['quote request', '/quote'],
      ['contact page', '/contact'],
      ['sign-in', '/login'],
      ['registration', '/register'],
      ['business registration', '/register?type=business'],
      ['password reset', '/forgot-password'],
    ];
    for (const [name, path] of pages) {
      await test.step(name, async () => {
        await open(page, path);
        await expectAccessible(page, testInfo, name);
      });
    }

    await test.step('basket with an item', async () => {
      await open(page, `/products/${product.slug}`);
      await page.getByRole('button', { name: 'Add to basket' }).click();
      await open(page, '/cart');
      await expectAccessible(page, testInfo, 'basket with an item');
    });
  });

  test('customer account pages and checkout', async ({ actAs }, testInfo) => {
    const { page, api } = await actAs('customer');
    const product = await productBySku(api, PRODUCTS.fitting);
    const orderId = await customerOrderId(api, SEEDED.deliveredRetailOrder);
    const confirmedId = await customerOrderId(api, SEEDED.confirmedRetailOrder);
    for (const [name, path] of [
      ['account overview', '/account'],
      ['order history', '/account/orders'],
      ['delivered order', `/account/orders/${orderId}`],
      // What a customer sees straight after checkout: the banner follows ?placed=1.
      ['order confirmation', `/account/orders/${confirmedId}?placed=1`],
      ['address book', '/account/addresses'],
      ['personal quotations', '/account/quotations'],
    ] as const) {
      await test.step(name, async () => {
        await open(page, path);
        await expectAccessible(page, testInfo, name);
      });
    }

    await test.step('checkout with an item in the basket', async () => {
      await open(page, `/products/${product.slug}`);
      await page.getByRole('button', { name: 'Add to basket' }).click();
      await open(page, '/checkout');
      await expect(page.getByRole('button', { name: 'Place order' })).toBeVisible();
      await expectAccessible(page, testInfo, 'checkout');
    });
  });

  test('trade portal pages', async ({ actAs }, testInfo) => {
    const { page, api } = await actAs('buyer');
    const organizationId = await api.organizationId();
    const quotationId = await organizationQuotationId(api, organizationId, SEEDED.openQuotation);
    const rfqId = await organizationRfqId(api, organizationId, SEEDED.submittedRfq);
    const orderId = await organizationOrderId(api, organizationId, SEEDED.tradeOrderInProgress);
    for (const [name, path] of [
      ['trade dashboard', '/business'],
      ['RFQ list', '/business/rfqs'],
      ['RFQ detail', `/business/rfqs/${rfqId}`],
      ['quotation list', '/business/quotations'],
      ['quotation awaiting a response', `/business/quotations/${quotationId}`],
      ['trade orders', '/business/orders'],
      ['trade order detail', `/business/orders/${orderId}`],
      ['delivery sites', '/business/sites'],
      ['team', '/business/team'],
      ['company profile', '/business/company'],
    ] as const) {
      await test.step(name, async () => {
        await open(page, path);
        await expectAccessible(page, testInfo, name);
      });
    }
  });

  test('back-office pages', async ({ actAs }, testInfo) => {
    const { page, api } = await actAs('admin');
    const orderId = await staffOrderId(api, SEEDED.tradeOrderInProgress);
    const kyc = await organizationByName(api, AL_WAHA.name);
    const rfqId = await staffRfqId(api, SEEDED.submittedRfq);
    const quotationId = await staffQuotationId(api, SEEDED.openQuotation);
    for (const [name, path] of [
      ['back-office dashboard', '/admin'],
      ['order queue', '/admin/orders'],
      ['order fulfilment', `/admin/orders/${orderId}`],
      ['RFQ inbox', '/admin/rfqs'],
      ['RFQ triage', `/admin/rfqs/${rfqId}`],
      ['quotation list', '/admin/quotations'],
      ['quotation editor', `/admin/quotations/${quotationId}`],
      ['organizations', '/admin/organizations'],
      ['KYC review', `/admin/organizations/${kyc.id}`],
      ['products', '/admin/products'],
      ['users', '/admin/users'],
      ['audit trail', '/admin/audit'],
    ] as const) {
      await test.step(name, async () => {
        await open(page, path);
        await expectAccessible(page, testInfo, name);
      });
    }
  });

  // axe flags these links only when a row holds enough text (a user in many organizations), so the
  // fix is pinned directly: a link next to other text must not rely on colour alone (WCAG 1.4.1).
  test('organization links in the users list are underlined', async ({ actAs }) => {
    const { page } = await actAs('admin');
    await open(page, `/admin/users?search=${encodeURIComponent(DEMO_ACCOUNTS.owner.email)}`);
    const row = page.getByRole('row').filter({ hasText: DEMO_ACCOUNTS.owner.email });
    await expect(row.getByRole('link', { name: DESERT_BLOOM.name })).toHaveCSS('text-decoration-line', 'underline');
  });
});
