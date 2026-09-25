import { expectAccessible } from '../support/a11y';
import { AL_WAHA } from '../support/accounts';
import { PRODUCTS, SEEDED, customerOrderId, organizationByName, organizationQuotationId, productBySku, staffOrderId } from '../support/data';
import { test } from '../support/fixtures';
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

  test('customer account pages', async ({ actAs }, testInfo) => {
    const { page, api } = await actAs('customer');
    const orderId = await customerOrderId(api, SEEDED.deliveredRetailOrder);
    for (const [name, path] of [
      ['account overview', '/account'],
      ['order history', '/account/orders'],
      ['order detail', `/account/orders/${orderId}`],
      ['address book', '/account/addresses'],
      ['personal quotations', '/account/quotations'],
    ] as const) {
      await test.step(name, async () => {
        await open(page, path);
        await expectAccessible(page, testInfo, name);
      });
    }
  });

  test('trade portal pages', async ({ actAs }, testInfo) => {
    const { page, api } = await actAs('buyer');
    const organizationId = await api.organizationId();
    const quotationId = await organizationQuotationId(api, organizationId, SEEDED.openQuotation);
    for (const [name, path] of [
      ['trade dashboard', '/business'],
      ['RFQ list', '/business/rfqs'],
      ['quotation list', '/business/quotations'],
      ['quotation awaiting a response', `/business/quotations/${quotationId}`],
      ['trade orders', '/business/orders'],
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
    for (const [name, path] of [
      ['back-office dashboard', '/admin'],
      ['order queue', '/admin/orders'],
      ['order fulfilment', `/admin/orders/${orderId}`],
      ['RFQ inbox', '/admin/rfqs'],
      ['quotation list', '/admin/quotations'],
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
});
