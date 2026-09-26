import {
  DEMO_ACCOUNTS,
  type MemberDto,
  type OrderDto,
  type OrganizationDto,
  type QuotationDto,
} from '@topflow/shared';
import { randomUUID } from 'node:crypto';
import { E2eHarness, uniqueEmail, type TestSession } from './support/harness';

// Decision tables A (purchase approval by spending limit) and B (release on credit terms) from
// docs/testing/TEST-PLAN.md, exercised through HTTP against PostgreSQL at their boundary values.
// Each table uses a new organization, so earlier runs and other suites cannot shift the limits.

const harness = new E2eHarness();
let sales: TestSession;
let productId: string;

beforeAll(async () => {
  await harness.start();
  // The seeded sales account, as published in @topflow/shared.
  const salesEmail = DEMO_ACCOUNTS.find(({ email }) =>
    email.startsWith('sales@'),
  )?.email;
  if (!salesEmail) throw new Error('No sales demo account in @topflow/shared');
  sales = await harness.sessionFor(salesEmail);
  productId = (await harness.product('AX-EFS-002')).id;
});

afterAll(async () => {
  await harness.stop();
});

/** A new trade customer, pending verification, whose owner signed up with it. */
async function newOrganization(
  name: string,
): Promise<{ owner: TestSession; organizationId: string }> {
  const owner = await harness.sessionWith({
    id: randomUUID(),
    email: uniqueEmail('owner'),
    userMetadata: {
      full_name: `${name} Owner`,
      organization: {
        name,
        type: 'CONTRACTOR',
        tradeLicenseNumber: `DED-${randomUUID().slice(0, 8)}`,
      },
    },
  });
  return { owner, organizationId: owner.user.memberships[0].organizationId };
}

async function review(
  organizationId: string,
  terms: Record<string, unknown>,
): Promise<OrganizationDto> {
  const response = await harness
    .http()
    .patch(`/admin/organizations/${organizationId}/review`)
    .set(harness.bearer(sales))
    .send(terms)
    .expect(200);
  return response.body as OrganizationDto;
}

/** Joins the organization through an owner's invitation, then applies the member's limit. */
async function addMember(
  owner: TestSession,
  organizationId: string,
  role: 'APPROVER' | 'BUYER',
  approvalLimit: string | null,
): Promise<TestSession> {
  const email = uniqueEmail(role.toLowerCase());
  await harness
    .http()
    .post('/org/invitations')
    .set(harness.member(owner, organizationId))
    .send({ email, role })
    .expect(201);
  const session = await harness.sessionWith({
    id: randomUUID(),
    email,
    userMetadata: { full_name: `Table ${role}` },
  });
  await harness
    .http()
    .post('/invitations/accept')
    .set(harness.bearer(session))
    .send({ token: harness.tokenFromMail(email, 'invitations/accept') })
    .expect(200);
  const members = (
    await harness
      .http()
      .get('/org/members')
      .set(harness.member(owner, organizationId))
      .expect(200)
  ).body as MemberDto[];
  const member = members.find((m) => m.email === email);
  if (!member) throw new Error(`${email} did not join`);
  await harness
    .http()
    .patch(`/org/members/${member.id}`)
    .set(harness.member(owner, organizationId))
    .send({ approvalLimit })
    .expect(200);
  return session;
}

/** A sent quotation of one line at `listPrice` (net, no discount, no delivery). */
async function sentQuotation(
  organizationId: string,
  customer: TestSession,
  listPrice: string,
): Promise<QuotationDto> {
  const draft = (
    await harness
      .http()
      .post('/admin/quotations')
      .set(harness.bearer(sales))
      .send({
        organizationId,
        customerId: customer.user.id,
        items: [{ productId, quantity: 1, listPrice, discountRate: 0 }],
        validityDays: 7,
      })
      .expect(201)
  ).body as QuotationDto;
  return (
    await harness
      .http()
      .post(`/admin/quotations/${draft.id}/send`)
      .set(harness.bearer(sales))
      .expect(200)
  ).body as QuotationDto;
}

async function accept(
  member: TestSession,
  organizationId: string,
  quotation: QuotationDto,
): Promise<QuotationDto> {
  return (
    await harness
      .http()
      .post(`/org/quotations/${quotation.id}/respond`)
      .set(harness.member(member, organizationId))
      .send({ action: 'ACCEPT' })
      .expect(200)
  ).body as QuotationDto;
}

function approve(
  member: TestSession,
  organizationId: string,
  quotation: QuotationDto,
) {
  return harness
    .http()
    .post(`/org/quotations/${quotation.id}/approval`)
    .set(harness.member(member, organizationId))
    .send({ decision: 'APPROVE' });
}

describe('decision table A: purchase approval by spending limit', () => {
  let organizationId: string;
  let owner: TestSession;
  let approver: TestSession;
  let buyer: TestSession;
  let unlimitedBuyer: TestSession;

  beforeAll(async () => {
    ({ owner, organizationId } = await newOrganization('Table A Landscaping'));
    await review(organizationId, {
      status: 'ACTIVE',
      paymentTerms: 'NET_30',
      creditLimit: '1000000.00',
      discountRate: 0,
    });
    approver = await addMember(owner, organizationId, 'APPROVER', '50000.00');
    buyer = await addMember(owner, organizationId, 'BUYER', '5000.00');
    unlimitedBuyer = await addMember(owner, organizationId, 'BUYER', null);
  });

  it.each([
    ['A1', 'one fils below the buyer limit', '4999.99'],
    ['A2', 'exactly at the buyer limit', '5000.00'],
  ])('%s: %s is accepted at once', async (_rule, _case, net) => {
    const accepted = await accept(
      buyer,
      organizationId,
      await sentQuotation(organizationId, buyer, net),
    );
    expect(accepted).toMatchObject({ status: 'ACCEPTED', subtotal: net });
    expect(accepted.orderId).toBeTruthy();
  });

  it('A3: one fils above the buyer limit waits for an approver, never the buyer', async () => {
    const quotation = await sentQuotation(organizationId, buyer, '5000.01');
    const pending = await accept(buyer, organizationId, quotation);
    expect(pending).toMatchObject({
      status: 'PENDING_APPROVAL',
      orderId: null,
    });
    await approve(buyer, organizationId, quotation).expect(403);
    const approved = (
      await approve(approver, organizationId, quotation).expect(200)
    ).body as QuotationDto;
    expect(approved.status).toBe('ACCEPTED');
    expect(approved.orderId).toBeTruthy();
  });

  it('A4: a buyer without a limit needs approval for any amount', async () => {
    const pending = await accept(
      unlimitedBuyer,
      organizationId,
      await sentQuotation(organizationId, unlimitedBuyer, '0.01'),
    );
    expect(pending.status).toBe('PENDING_APPROVAL');
  });

  it('A2 for sign-off: an approver may approve up to their own limit', async () => {
    const quotation = await sentQuotation(organizationId, buyer, '50000.00');
    await accept(buyer, organizationId, quotation);
    const approved = (
      await approve(approver, organizationId, quotation).expect(200)
    ).body as QuotationDto;
    expect(approved.status).toBe('ACCEPTED');
  });

  it('A3 for sign-off: one fils above the approver limit needs the owner', async () => {
    const quotation = await sentQuotation(organizationId, buyer, '50000.01');
    await accept(buyer, organizationId, quotation);
    const refused = await approve(approver, organizationId, quotation).expect(
      403,
    );
    expect((refused.body as { message: string }).message).toMatch(
      /exceeds your approval limit/,
    );
    const approved = (
      await approve(owner, organizationId, quotation).expect(200)
    ).body as QuotationDto;
    expect(approved.status).toBe('ACCEPTED');
  });

  it('A3 for an approver buying above their own limit: nobody approves their own purchase', async () => {
    const quotation = await sentQuotation(organizationId, approver, '50000.01');
    expect((await accept(approver, organizationId, quotation)).status).toBe(
      'PENDING_APPROVAL',
    );
    await approve(approver, organizationId, quotation).expect(403);
    await approve(owner, organizationId, quotation).expect(200);
  });

  it('A5: an owner without a limit accepts any amount at once', async () => {
    const accepted = await accept(
      owner,
      organizationId,
      await sentQuotation(organizationId, owner, '50000.01'),
    );
    expect(accepted.status).toBe('ACCEPTED');
  });
});

describe('decision table B: release on credit terms', () => {
  let organizationId: string;
  let owner: TestSession;

  /** The owner (no limit, so no approval step) accepts a quotation; returns the new order. */
  async function order(net: string): Promise<OrderDto> {
    const accepted = await accept(
      owner,
      organizationId,
      await sentQuotation(organizationId, owner, net),
    );
    if (!accepted.orderId) throw new Error('No order was created');
    return (
      await harness
        .http()
        .get(`/org/orders/${accepted.orderId}`)
        .set(harness.member(owner, organizationId))
        .expect(200)
    ).body as OrderDto;
  }

  async function recordPayment(orderId: string): Promise<void> {
    await harness
      .http()
      .post(`/admin/orders/${orderId}/payment`)
      .set(harness.bearer(sales))
      .send({ paymentReference: 'TABLE-B' })
      .expect(200);
  }

  async function cancel(orderId: string): Promise<void> {
    await harness
      .http()
      .patch(`/admin/orders/${orderId}/status`)
      .set(harness.bearer(sales))
      .send({ status: 'CANCELLED', note: 'Decision table B clean-up' })
      .expect(200);
  }

  beforeAll(async () => {
    ({ owner, organizationId } = await newOrganization('Table B Contracting'));
  });

  it('B0: an organization pending verification cannot accept a quotation', async () => {
    const quotation = await sentQuotation(organizationId, owner, '10.00');
    await harness
      .http()
      .post(`/org/quotations/${quotation.id}/respond`)
      .set(harness.member(owner, organizationId))
      .send({ action: 'ACCEPT' })
      .expect(403);
  });

  it('B4 and B5: released while exposure plus the order stays within the limit, including the limit itself', async () => {
    await review(organizationId, {
      status: 'ACTIVE',
      paymentTerms: 'NET_30',
      creditLimit: '1050.00',
      discountRate: 0,
    });
    // Net 1,000.00 + VAT 50.00: exposure 1,050.00 equals the limit.
    const atLimit = await order('1000.00');
    expect(atLimit).toMatchObject({
      totalAmount: '1050.00',
      status: 'CONFIRMED',
      paymentMethod: 'CREDIT_ACCOUNT',
    });
    // Net 0.20 + VAT 0.01: exposure would be 1,050.21, one order above the limit.
    const overLimit = await order('0.20');
    expect(overLimit).toMatchObject({
      totalAmount: '0.21',
      status: 'PENDING_PAYMENT',
      paymentMethod: 'BANK_TRANSFER',
    });

    // Paid orders stop counting; unpaid orders waiting for payment still count (0.21).
    await recordPayment(atLimit.id);
    const refilled = await order('999.80');
    expect(refilled).toMatchObject({
      totalAmount: '1049.79',
      status: 'CONFIRMED',
    });

    // Cancelled orders stop counting too; a single order above the limit still waits.
    await cancel(overLimit.id);
    await recordPayment(refilled.id);
    const single = await order('1000.01');
    expect(single).toMatchObject({
      totalAmount: '1050.01',
      status: 'PENDING_PAYMENT',
    });
    await cancel(single.id);
  });

  it('B2: a prepaid account always waits for payment', async () => {
    await review(organizationId, { paymentTerms: 'PREPAID' });
    expect(await order('0.20')).toMatchObject({
      status: 'PENDING_PAYMENT',
      paymentMethod: 'BANK_TRANSFER',
    });
  });

  it('B6: credit terms with a zero limit release nothing on credit', async () => {
    await review(organizationId, {
      paymentTerms: 'NET_60',
      creditLimit: '0.00',
    });
    expect((await order('0.20')).status).toBe('PENDING_PAYMENT');
  });
});

describe('decision table B under concurrency: one credit limit, two acceptances at once', () => {
  let organizationId: string;
  let owner: TestSession;

  beforeAll(async () => {
    ({ owner, organizationId } = await newOrganization('Table B Parallel'));
    await review(organizationId, {
      status: 'ACTIVE',
      paymentTerms: 'NET_30',
      creditLimit: '1050.00',
      discountRate: 0,
    });
  });

  async function orderOf(quotation: QuotationDto): Promise<OrderDto> {
    if (!quotation.orderId) throw new Error('No order was created');
    return (
      await harness
        .http()
        .get(`/org/orders/${quotation.orderId}`)
        .set(harness.member(owner, organizationId))
        .expect(200)
    ).body as OrderDto;
  }

  // Each order alone equals the limit, so together they are one order above it. Without a lock on
  // the organisation both transactions read an exposure of 0.00 and both released on credit
  // (BUG-13 in docs/testing/BUGS-FOUND.md). Several rounds, because a race does not show every time.
  it.each([1, 2, 3, 4, 5])(
    'round %i: at most one of two simultaneous acceptances is released on credit',
    async () => {
      const [first, second] = await Promise.all([
        sentQuotation(organizationId, owner, '1000.00'),
        sentQuotation(organizationId, owner, '1000.00'),
      ]);
      const accepted = await Promise.all([
        accept(owner, organizationId, first),
        accept(owner, organizationId, second),
      ]);
      const orders = await Promise.all(accepted.map(orderOf));
      expect(orders.map((o) => o.totalAmount)).toEqual(['1050.00', '1050.00']);
      expect(orders.map((o) => o.status).sort()).toEqual([
        'CONFIRMED',
        'PENDING_PAYMENT',
      ]);
      expect(orders.find((o) => o.status === 'CONFIRMED')?.paymentMethod).toBe(
        'CREDIT_ACCOUNT',
      );
      // Clear the exposure for the next round.
      for (const o of orders) {
        await harness
          .http()
          .patch(`/admin/orders/${o.id}/status`)
          .set(harness.bearer(sales))
          .send({ status: 'CANCELLED', note: 'Concurrency round clean-up' })
          .expect(200);
      }
    },
  );
});
