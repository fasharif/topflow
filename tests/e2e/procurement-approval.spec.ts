import { OrderStatus, fromFils, formatMoney, toFils, type OrderDto, type QuotationDto } from '@topflow/shared';
import { DEMO_ACCOUNTS, DESERT_BLOOM } from '../support/accounts';
import { productBySku } from '../support/data';
import { runId } from '../support/env';
import { expect, test } from '../support/fixtures';
import { creditPosition, expectedRelease } from '../support/money';
import { open } from '../support/page';

// Money path 2: a Desert Bloom buyer (AED 5,000 limit) asks for a quotation, Top Flow sales
// prices and sends it, the buyer accepts above their limit, and the approver (AED 50,000 limit)
// signs off. Only then is a sales order created, on the organization's credit terms.

const SKU = 'AX-RB-SJ-01';
const QUANTITY = 60;

test.describe('money path 2: RFQ, approval above the buyer limit, order', () => {
  test.describe.configure({ timeout: 180_000 });

  test('a purchase above the buyer limit waits for an approver, then becomes an order', async ({ actAs }) => {
    const buyer = await actAs('buyer');
    const sales = await actAs('sales');
    const approver = await actAs('approver');
    const organizationId = await buyer.api.organizationId();
    const product = await productBySku(buyer.api, SKU);
    const project = `Playwright approval ${runId()}`;

    let rfqId = '';
    await test.step('the buyer adds 60 swing joints to the basket and submits an RFQ', async () => {
      const { page } = buyer;
      await open(page, `/products/${product.slug}`);
      await page.getByRole('spinbutton', { name: 'Quantity' }).fill(String(QUANTITY));
      // The purchase panel comes first; related products further down have their own buttons.
      await page.getByRole('button', { name: 'Add to quote' }).first().click();
      await open(page, '/cart');
      await expect(page.getByRole('heading', { name: 'Request a trade quotation' })).toBeVisible();
      await page.getByLabel('Project reference').fill(project);
      await page.getByRole('button', { name: 'Submit RFQ' }).click();
      await page.waitForURL(/\/business\/rfqs\/[^/?]+\?submitted=1$/);
      rfqId = new URL(page.url()).pathname.split('/').pop() ?? '';
      await expect(page.getByText(project).first()).toBeVisible();
    });

    let quotationId = '';
    await test.step('sales prices the RFQ with the trade discount and sends the quotation', async () => {
      const { page } = sales;
      await open(page, `/admin/rfqs/${rfqId}`);
      await page.getByRole('link', { name: 'Create quotation' }).click();
      await expect(page.getByRole('heading', { name: 'New quotation' })).toBeVisible();
      await expect(page.getByLabel(`Quantity of ${SKU}`)).toHaveValue(String(QUANTITY));
      await page.getByRole('button', { name: 'Create draft' }).click();
      await page.waitForURL(/\/admin\/quotations\/[^/?]+$/);
      quotationId = new URL(page.url()).pathname.split('/').pop() ?? '';
      page.once('dialog', (dialog) => void dialog.accept());
      await page.getByRole('button', { name: 'Send to customer' }).click();
      await expect(page.getByText('Awaiting response').first()).toBeVisible();
    });

    const quotation = await buyer.api.get<QuotationDto>(`/org/quotations/${quotationId}`, { organizationId });
    const netFils = toFils(quotation.subtotal) + toFils(quotation.deliveryFee);
    expect(netFils, 'the scenario needs a purchase above the buyer limit').toBeGreaterThan(toFils(DESERT_BLOOM.buyerLimit));
    expect(netFils, 'and within the approver limit').toBeLessThanOrEqual(toFils(DESERT_BLOOM.approverLimit));
    expect(quotation.items[0]?.discountRate, 'Desert Bloom trade discount').toBe('7.50');

    await test.step('the buyer accepts and the purchase goes to an approver', async () => {
      const { page } = buyer;
      await open(page, `/business/quotations/${quotationId}`);
      await expect(page.getByText('Approval required')).toBeVisible();
      await expect(
        page.getByText(`Net value ${formatMoney(fromFils(netFils))} is above your limit of ${formatMoney(DESERT_BLOOM.buyerLimit)}.`),
      ).toBeVisible();
      await page.getByLabel('Purchase order number').fill(`PO-${project.slice(-6)}`);
      await page.getByRole('button', { name: 'Send for approval' }).click();
      await expect(page.getByText('Sent for approval.')).toBeVisible();
      await expect(page.getByText('Pending internal approval').first()).toBeVisible();
      // Segregation of duties: nobody approves their own purchase, in the UI or through the API.
      await expect(page.getByRole('button', { name: 'Approve purchase' })).toHaveCount(0);
      const selfApproval = await buyer.api.send('POST', `/org/quotations/${quotationId}/approval`, {
        organizationId,
        body: { decision: 'APPROVE' },
      });
      expect(selfApproval.status()).toBe(403);
    });

    const position = await creditPosition(approver.api, organizationId);
    const release = expectedRelease(position, quotation.total);

    let orderId = '';
    await test.step('the approver signs off and a sales order is created', async () => {
      const { page } = approver;
      await open(page, `/business/quotations/${quotationId}`);
      await expect(page.getByText('Your approval is needed')).toBeVisible();
      await expect(page.getByText(`${DEMO_ACCOUNTS.buyer.name} accepted this quotation`)).toBeVisible();
      await page.getByRole('button', { name: 'Approve purchase' }).click();
      await expect(page.getByText(/Purchase approved — sales order TF-SO-\d{4}-\d{6} has been created\./)).toBeVisible();
      await page.getByRole('link', { name: /View order TF-SO-/ }).click();
      await page.waitForURL(/\/business\/orders\/[^/?]+$/);
      orderId = new URL(page.url()).pathname.split('/').pop() ?? '';
    });

    await test.step('the order follows the credit terms and keeps the quoted prices', async () => {
      const order = await approver.api.get<OrderDto>(`/org/orders/${orderId}`, { organizationId });
      expect(order).toMatchObject({
        channel: 'B2B',
        status: release,
        totalAmount: quotation.total,
        purchaseOrderNumber: `PO-${project.slice(-6)}`,
        paymentMethod: release === OrderStatus.CONFIRMED ? 'CREDIT_ACCOUNT' : 'BANK_TRANSFER',
      });
      expect(order.quotation?.id).toBe(quotationId);
      await expect(approver.page.getByText(release === OrderStatus.CONFIRMED ? 'Confirmed' : 'Pending payment').first()).toBeVisible();
    });
  });
});
