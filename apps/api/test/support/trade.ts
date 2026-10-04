import {
  DEMO_ACCOUNTS,
  type AddressDto,
  type MemberDto,
  type OrderDto,
  type OrgRole,
  type QuotationDto,
  type RfqDto,
} from '@topflow/shared';
import { randomUUID } from 'node:crypto';
import { uniqueEmail, type E2eHarness, type TestSession } from './harness';

/** The seeded staff account whose address starts with `prefix`, as published in @topflow/shared. */
export function staffSession(
  harness: E2eHarness,
  prefix: 'sales' | 'warehouse' | 'admin',
): Promise<TestSession> {
  const email = DEMO_ACCOUNTS.find((account) =>
    account.email.startsWith(`${prefix}@`),
  )?.email;
  if (!email) throw new Error(`No ${prefix} demo account in @topflow/shared`);
  return harness.sessionFor(email);
}

/**
 * Test data for the trade and retail workflows, created through the API as the clients would:
 * companies with their members, quotations and orders. Every call makes new records, so a test
 * that needs fresh data for each round simply calls again.
 */
export class TradeFixture {
  constructor(
    private readonly harness: E2eHarness,
    private readonly sales: TestSession,
    /** The product every quotation, RFQ and order of the fixture is for. */
    readonly productId: string,
  ) {}

  /** A new trade customer whose owner signed up with it, verified, on credit terms it cannot exhaust. */
  async organization(
    name: string,
  ): Promise<{ owner: TestSession; organizationId: string }> {
    const owner = await this.harness.sessionWith({
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
    const organizationId = owner.user.memberships[0].organizationId;
    await this.harness
      .http()
      .patch(`/admin/organizations/${organizationId}/review`)
      .set(this.harness.bearer(this.sales))
      .send({
        status: 'ACTIVE',
        paymentTerms: 'NET_30',
        creditLimit: '1000000.00',
        discountRate: 0,
      })
      .expect(200);
    return { owner, organizationId };
  }

  /** Sends an invitation and returns it with the session of the invited account, not yet a member. */
  async invite(
    owner: TestSession,
    organizationId: string,
    role: OrgRole,
  ): Promise<{ invitationId: string; token: string; invitee: TestSession }> {
    const email = uniqueEmail(role.toLowerCase());
    const invitation = (
      await this.harness
        .http()
        .post('/org/invitations')
        .set(this.harness.member(owner, organizationId))
        .send({ email, role })
        .expect(201)
    ).body as { id: string };
    const invitee = await this.harness.sessionWith({
      id: randomUUID(),
      email,
      userMetadata: { full_name: `Invited ${role}` },
    });
    return {
      invitationId: invitation.id,
      token: this.harness.tokenFromMail(email, 'invitations/accept'),
      invitee,
    };
  }

  /** Joins the organization through an owner's invitation, then applies the member's limit. */
  async member(
    owner: TestSession,
    organizationId: string,
    role: OrgRole,
    approvalLimit: string | null = null,
  ): Promise<{ session: TestSession; memberId: string }> {
    const { token, invitee } = await this.invite(owner, organizationId, role);
    await this.harness
      .http()
      .post('/invitations/accept')
      .set(this.harness.bearer(invitee))
      .send({ token })
      .expect(200);
    const member = (await this.members(owner, organizationId)).find(
      (m) => m.userId === invitee.user.id,
    );
    if (!member) throw new Error(`${invitee.user.email} did not join`);
    if (approvalLimit !== null) {
      await this.harness
        .http()
        .patch(`/org/members/${member.id}`)
        .set(this.harness.member(owner, organizationId))
        .send({ approvalLimit })
        .expect(200);
    }
    return { session: invitee, memberId: member.id };
  }

  async members(
    member: TestSession,
    organizationId: string,
  ): Promise<MemberDto[]> {
    return (
      await this.harness
        .http()
        .get('/org/members')
        .set(this.harness.member(member, organizationId))
        .expect(200)
    ).body as MemberDto[];
  }

  /** A draft quotation of one line at `listPrice` (net, no discount, no delivery). */
  async draftQuotation(
    target:
      | { organizationId: string; customerId: string }
      | { customerId: string }
      | { quoteRequestId: string },
    listPrice = '100.00',
  ): Promise<QuotationDto> {
    return (
      await this.harness
        .http()
        .post('/admin/quotations')
        .set(this.harness.bearer(this.sales))
        .send({
          ...target,
          items: [
            {
              productId: this.productId,
              quantity: 1,
              listPrice,
              discountRate: 0,
            },
          ],
          validityDays: 7,
        })
        .expect(201)
    ).body as QuotationDto;
  }

  async send(quotationId: string): Promise<QuotationDto> {
    return (
      await this.harness
        .http()
        .post(`/admin/quotations/${quotationId}/send`)
        .set(this.harness.bearer(this.sales))
        .expect(200)
    ).body as QuotationDto;
  }

  /** A quotation sent to a member of an organization. */
  async sentQuotation(
    organizationId: string,
    customer: TestSession,
    listPrice = '100.00',
  ): Promise<QuotationDto> {
    const draft = await this.draftQuotation(
      { organizationId, customerId: customer.user.id },
      listPrice,
    );
    return this.send(draft.id);
  }

  /** A trade RFQ for one unit of the fixture's product, submitted by a member. */
  async rfq(member: TestSession, organizationId: string): Promise<RfqDto> {
    return (
      await this.harness
        .http()
        .post('/org/rfqs')
        .set(this.harness.member(member, organizationId))
        .send({ items: [{ productId: this.productId, quantity: 1 }] })
        .expect(201)
    ).body as RfqDto;
  }

  /** A new retail customer with one saved address. */
  async shopper(): Promise<{ session: TestSession; addressId: string }> {
    const session = await this.harness.sessionWith({
      id: randomUUID(),
      email: uniqueEmail('shopper'),
      userMetadata: { full_name: 'Concurrency Shopper' },
    });
    const address = (
      await this.harness
        .http()
        .post('/me/addresses')
        .set(this.harness.bearer(session))
        .send({
          label: 'Home',
          contactName: 'Concurrency Shopper',
          phoneNumber: '+971 50 555 0188',
          line1: 'Villa 3, Street 9',
          area: 'Al Barsha',
          city: 'Dubai',
          emirate: 'DUBAI',
          isDefault: true,
        })
        .expect(201)
    ).body as AddressDto;
    return { session, addressId: address.id };
  }

  /** A confirmed retail order of `quantity` units, paid on delivery. */
  async retailOrder(
    shopper: { session: TestSession; addressId: string },
    quantity = 1,
  ): Promise<OrderDto> {
    return (
      await this.harness
        .http()
        .post('/me/orders')
        .set(this.harness.bearer(shopper.session))
        .send({
          items: [{ productId: this.productId, quantity }],
          addressId: shopper.addressId,
          paymentMethod: 'CASH_ON_DELIVERY',
        })
        .expect(201)
    ).body as OrderDto;
  }
}
