import { formatMoney, type OrderDto, type QuotationDto } from '@topflow/shared';
import { BffClient } from '../support/bff';
import { PRODUCTS, productBySku } from '../support/data';
import { runId, stack } from '../support/env';
import { expect, test } from '../support/fixtures';
import { Mailpit } from '../support/mailpit';
import { open } from '../support/page';

// Money path 3: a new business applies for a trade account, confirms its email address and asks
// for a quotation. Top Flow sales verify the company (KYC) and grant credit terms, the owner
// accepts the quotation, and the warehouse picks, dispatches (deducting stock) and delivers.

const QUANTITY = 12;

test.describe('money path 3: company verification, fulfilment and stock deduction', () => {
  test.describe.configure({ timeout: 240_000 });

  test('a verified company buys on credit and dispatch deducts stock', async ({ browser, actAs, mailpit }) => {
    const id = runId();
    const company = `Playwright Irrigation ${id}`;
    const email = `owner.${id}@e2e.topflow.test`;
    const password = `Pw-${id}-2026`;
    const sales = await actAs('sales');
    const warehouse = await actAs('warehouse');
    const product = await productBySku(sales.api, PRODUCTS.fitting);

    // The applicant uses a browser of their own, like any new customer.
    const applicantContext = await browser.newContext({ baseURL: stack.webUrl });
    const owner = { page: await applicantContext.newPage(), api: new BffClient(applicantContext.request) };

    try {
      await test.step('the company applies for a trade account', async () => {
        const { page } = owner;
        await open(page, '/register?type=business');
        await page.getByLabel('Company name').fill(company);
        await page.getByLabel('Business type').selectOption('LANDSCAPING');
        await page.getByLabel('Trade licence number').fill(`DED-PW-${id}`);
        await page.getByLabel('Your full name').fill('Playwright Owner');
        await page.getByLabel('Work email').fill(email);
        await page.getByLabel('Password', { exact: true }).fill(password);
        await page.getByLabel('Confirm password').fill(password);
        await page.getByRole('button', { name: 'Apply for a trade account' }).click();
        await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();
      });

      await test.step('the owner confirms the email address and lands in the trade portal', async () => {
        const message = await mailpit.latest(email, 'Confirm your Top Flow account');
        await owner.page.goto(Mailpit.link(message, '/auth/confirm'));
        await owner.page.waitForURL(/\/business\?welcome=1$/);
        await expect(owner.page.getByText('Trade account application received')).toBeVisible();
        await expect(owner.page.getByText('Verification in progress')).toBeVisible();
      });

      let rfqId = '';
      await test.step('the owner requests a quotation for 12 tees', async () => {
        const { page } = owner;
        await open(page, `/products/${product.slug}`);
        await page.getByRole('spinbutton', { name: 'Quantity' }).fill(String(QUANTITY));
        await page.getByRole('button', { name: 'Add to quote' }).first().click();
        await open(page, '/cart');
        await page.getByRole('button', { name: 'Submit RFQ' }).click();
        await page.waitForURL(/\/business\/rfqs\/[^/?]+\?submitted=1$/);
        rfqId = new URL(page.url()).pathname.split('/').pop() ?? '';
      });

      await test.step('sales verify the company and agree Net 30 terms with a credit limit', async () => {
        const { page } = sales;
        await open(page, `/admin/organizations?search=${encodeURIComponent(company)}`);
        await page.getByRole('link', { name: company }).click();
        await expect(page.getByText('Awaiting KYC review')).toBeVisible();
        await page.getByLabel('Account status').selectOption('ACTIVE');
        await page.getByLabel('Payment terms').selectOption('NET_30');
        await page.getByLabel('Credit limit (AED)').fill('20000.00');
        await page.getByLabel('Trade discount (%)').fill('5');
        await page.getByRole('button', { name: 'Save decision' }).click();
        await expect(page.getByText('Awaiting KYC review')).toHaveCount(0);
        await expect(page.getByText('Active', { exact: true }).first()).toBeVisible();
      });

      let quotationId = '';
      await test.step('sales quote the RFQ with the new trade discount and send it', async () => {
        const { page } = sales;
        await open(page, `/admin/rfqs/${rfqId}`);
        await page.getByRole('link', { name: 'Create quotation' }).click();
        // An empty discount field applies the organization's default trade discount, shown as the placeholder.
        await expect(page.getByLabel(`Discount on ${product.sku} (percent)`)).toHaveAttribute('placeholder', '5');
        await page.getByRole('button', { name: 'Create draft' }).click();
        await page.waitForURL(/\/admin\/quotations\/[^/?]+$/);
        quotationId = new URL(page.url()).pathname.split('/').pop() ?? '';
        page.once('dialog', (dialog) => void dialog.accept());
        await page.getByRole('button', { name: 'Send to customer' }).click();
        await expect(page.getByText('Awaiting response').first()).toBeVisible();
      });

      let orderId = '';
      await test.step('the owner accepts: no approval is needed and the order is released on credit', async () => {
        const { page } = owner;
        await open(page, `/business/quotations/${quotationId}`);
        await expect(page.getByText('Account verification pending')).toHaveCount(0);
        await page.getByLabel('Purchase order number').fill(`PO-${id}`);
        await page.getByRole('button', { name: 'Accept quotation' }).click();
        await expect(page.getByText(/Quotation accepted — sales order TF-SO-\d{4}-\d{6} has been created\./)).toBeVisible();
        const organizationId = await owner.api.organizationId();
        const quotation = await owner.api.get<QuotationDto>(`/org/quotations/${quotationId}`, { organizationId });
        if (!quotation.orderId) throw new Error('The accepted quotation has no order');
        orderId = quotation.orderId;
        const order = await owner.api.get<OrderDto>(`/org/orders/${orderId}`, { organizationId });
        expect(quotation.items[0]?.discountRate, 'the trade discount agreed at verification').toBe('5.00');
        expect(order).toMatchObject({ status: 'CONFIRMED', paymentMethod: 'CREDIT_ACCOUNT', totalAmount: quotation.total });
        await expect(page.getByText(formatMoney(quotation.total)).first()).toBeVisible();
      });

      const stockBefore = (await productBySku(warehouse.api, product.sku)).stockQuantity;

      await test.step('the warehouse picks and dispatches: stock is deducted at dispatch', async () => {
        const { page } = warehouse;
        await open(page, `/admin/orders/${orderId}`);
        await page.getByRole('button', { name: 'Mark as Processing' }).click();
        await page.getByRole('button', { name: 'Mark as Processing' }).click();
        await expect(page.getByText('Order marked as processing.')).toBeVisible();
        expect((await productBySku(warehouse.api, product.sku)).stockQuantity, 'picking does not move stock').toBe(stockBefore);

        await page.getByRole('button', { name: 'Mark as Dispatched' }).click();
        await page.getByLabel('Tracking reference').fill(`PW-TRACK-${id}`);
        await page.getByRole('button', { name: 'Mark as Dispatched' }).click();
        await expect(page.getByText('Order marked as dispatched.')).toBeVisible();
        expect((await productBySku(warehouse.api, product.sku)).stockQuantity).toBe(stockBefore - QUANTITY);
      });

      await test.step('the back-office stock list shows the new level', async () => {
        const { page } = warehouse;
        await open(page, `/admin/products?search=${encodeURIComponent(product.sku)}`);
        const row = page.getByRole('row').filter({ hasText: product.sku });
        await expect(row).toContainText(String(stockBefore - QUANTITY));
      });

      await test.step('the warehouse delivers and the owner sees the completed order', async () => {
        await open(warehouse.page, `/admin/orders/${orderId}`);
        await warehouse.page.getByRole('button', { name: 'Mark as Delivered' }).click();
        await warehouse.page.getByRole('button', { name: 'Mark as Delivered' }).click();
        await expect(warehouse.page.getByText('Order marked as delivered.')).toBeVisible();

        await open(owner.page, `/business/orders/${orderId}`);
        await expect(owner.page.getByText('Delivered', { exact: true }).first()).toBeVisible();
        await expect(owner.page.getByText(`PW-TRACK-${id}`).first()).toBeVisible();
        // A credit order stays unpaid on delivery: it is invoiced on the agreed terms.
        const order = await owner.api.get<OrderDto>(`/org/orders/${orderId}`, { organizationId: await owner.api.organizationId() });
        expect(order).toMatchObject({ status: 'DELIVERED', paymentStatus: 'UNPAID' });
      });
    } finally {
      await applicantContext.close();
    }
  });
});
