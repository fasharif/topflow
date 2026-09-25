import { formatMoney, type OrderDto, type OrganizationDto, type Paginated, type QuotationDto, type QuotationSummaryDto } from '@topflow/shared';
import { AL_WAHA } from '../support/accounts';
import { SEEDED, organizationByName, organizationQuotationId, staffOrderId } from '../support/data';
import { expect, test } from '../support/fixtures';
import { open } from '../support/page';

// Security checks through the real browser path (web app → /api handler → API guards). The API
// end-to-end suite covers the same rules with signed test tokens; these prove the deployed
// combination of web app and API enforces them too.

test.describe('security: tenant isolation', () => {
  test('one company cannot see or act on another company’s quotations', async ({ actAs }) => {
    const buyer = await actAs('buyer');
    const rival = await actAs('rivalOwner');
    const desertBloomId = await buyer.api.organizationId();
    const alWahaId = await rival.api.organizationId();
    const quotationId = await organizationQuotationId(buyer.api, desertBloomId, SEEDED.openQuotation);
    const quotation = await buyer.api.get<QuotationDto>(`/org/quotations/${quotationId}`, { organizationId: desertBloomId });

    await test.step('the trade portal shows "not found", not the quotation', async () => {
      await open(rival.page, `/business/quotations/${quotationId}`);
      await expect(rival.page.getByText('Quotation not found')).toBeVisible();
      await expect(rival.page.getByText(SEEDED.openQuotation)).toHaveCount(0);
      await expect(rival.page.getByText(formatMoney(quotation.total))).toHaveCount(0);
    });

    await test.step('inside its own organization the API does not find it', async () => {
      const asOwnOrganization = { organizationId: alWahaId };
      expect((await rival.api.send('GET', `/org/quotations/${quotationId}`, asOwnOrganization)).status()).toBe(404);
      expect((await rival.api.send('GET', `/org/quotations/${quotationId}/pdf`, asOwnOrganization)).status()).toBe(404);
      const respond = await rival.api.send('POST', `/org/quotations/${quotationId}/respond`, {
        ...asOwnOrganization,
        body: { action: 'REJECT', note: 'Attempt to reject another company’s quotation' },
      });
      expect(respond.status()).toBe(404);
      const list = await rival.api.get<Paginated<QuotationSummaryDto>>('/org/quotations', { ...asOwnOrganization, query: { pageSize: 100 } });
      expect(list.items.map((item) => item.number)).not.toContain(SEEDED.openQuotation);
    });

    await test.step('claiming the other organization in the header is refused', async () => {
      const asDesertBloom = { organizationId: desertBloomId };
      expect((await rival.api.send('GET', `/org/quotations/${quotationId}`, asDesertBloom)).status()).toBe(403);
      expect((await rival.api.send('GET', '/org/quotations', asDesertBloom)).status()).toBe(403);
      expect((await rival.api.send('GET', '/org', asDesertBloom)).status()).toBe(403);
    });

    await test.step('the quotation is untouched', async () => {
      const after = await buyer.api.get<QuotationDto>(`/org/quotations/${quotationId}`, { organizationId: desertBloomId });
      expect(after.status).toBe(quotation.status);
      expect(after.updatedAt).toBe(quotation.updatedAt);
    });
  });
});

test.describe('security: role-based access', () => {
  test('the warehouse role cannot approve a company, a purchase or a payment', async ({ actAs }) => {
    const warehouse = await actAs('warehouse');
    const admin = await actAs('admin');
    const buyer = await actAs('buyer');
    const kyc = await organizationByName(admin.api, AL_WAHA.name);
    const desertBloomId = await buyer.api.organizationId();
    const orderId = await staffOrderId(admin.api, SEEDED.tradeOrderInProgress);

    await test.step('the KYC review is not available to the warehouse', async () => {
      await open(warehouse.page, `/admin/organizations/${kyc.id}`);
      await expect(warehouse.page.getByText('Access restricted')).toBeVisible();
      await expect(warehouse.page.getByText('Organization review is not available to the Warehouse role.')).toBeVisible();
      await expect(warehouse.page.getByRole('button', { name: 'Save decision' })).toHaveCount(0);
      const review = await warehouse.api.send('PATCH', `/admin/organizations/${kyc.id}/review`, {
        body: { status: 'ACTIVE', paymentTerms: 'NET_60', creditLimit: '999999.00' },
      });
      expect(review.status()).toBe(403);
      const { organization: unchanged } = await admin.api.get<{ organization: OrganizationDto }>(`/admin/organizations/${kyc.id}`);
      expect(unchanged).toMatchObject({ status: kyc.status, paymentTerms: kyc.paymentTerms, creditLimit: kyc.creditLimit });
    });

    await test.step('purchase approvals belong to the customer organization', async () => {
      const quotationId = await organizationQuotationId(buyer.api, desertBloomId, SEEDED.pendingApprovalQuotation);
      const approval = await warehouse.api.send('POST', `/org/quotations/${quotationId}/approval`, {
        organizationId: desertBloomId,
        body: { decision: 'APPROVE' },
      });
      expect(approval.status()).toBe(403);
    });

    await test.step('recording a payment is for sales, not the warehouse', async () => {
      await open(warehouse.page, `/admin/orders/${orderId}`);
      await expect(warehouse.page.getByRole('button', { name: 'Mark as Dispatched' })).toBeVisible();
      await expect(warehouse.page.getByRole('button', { name: 'Record payment' })).toHaveCount(0);
      await expect(warehouse.page.getByRole('button', { name: 'Cancel order' })).toHaveCount(0);
      const payment = await warehouse.api.send('POST', `/admin/orders/${orderId}/payment`, { body: { paymentReference: 'NOT-ALLOWED' } });
      expect(payment.status()).toBe(403);
      const order = await admin.api.get<OrderDto>(`/admin/orders/${orderId}`);
      expect(order.paymentStatus).toBe('UNPAID');
    });
  });

  test('a customer cannot reach the back office', async ({ actAs }) => {
    const customer = await actAs('customer');
    await open(customer.page, '/admin');
    await expect(customer.page.getByText("You don't have access to this area")).toBeVisible();
    expect((await customer.api.send('GET', '/admin/dashboard')).status()).toBe(403);
    expect((await customer.api.send('GET', '/admin/orders')).status()).toBe(403);
  });

  test('state-changing calls from another site are refused', async ({ actAs }) => {
    const customer = await actAs('customer');
    const response = await customer.api.send('POST', '/me/addresses', {
      headers: { origin: 'https://attacker.example' },
      body: { label: 'CSRF', contactName: 'X', phoneNumber: '+971 50 000 0000', line1: 'X', area: 'X', city: 'X', emirate: 'DUBAI' },
    });
    expect(response.status()).toBe(403);
    expect(await response.json()).toMatchObject({ message: 'Cross-site requests are not allowed.' });
  });
});
