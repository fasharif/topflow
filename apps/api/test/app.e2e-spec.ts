import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  calculateTotals,
  fromFils,
  retailDeliveryFeeFils,
  toFils,
  type AddressDto,
  type AuthUser,
  type CategoryDto,
  type OrderDto,
  type Paginated,
  type ProductDto,
  type QuotationDto,
  type RfqDto,
  type UserAdminDto,
  type WebsiteQuoteReceiptDto,
} from '@topflow/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { IdentityAdminService } from '../src/auth/identity-admin.service';
import { configureApp } from '../src/bootstrap';
import { APP_CONFIG } from '../src/config/config.module';
import type { AppConfig } from '../src/config/env';
import { MailService } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  FakeIdentityAdmin,
  signAccessToken,
  type TestIdentity,
} from './support/supabase';

interface TestSession {
  accessToken: string;
  user: AuthUser;
}

const unique = (prefix: string) =>
  `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@e2e.topflow.test`;
const daysFromNow = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

describe('TopFlow Hub API (e2e)', () => {
  let app: INestApplication;
  let mail: MailService;
  let prisma: PrismaService;
  const identities = new FakeIdentityAdmin();

  const http = () => request(app.getHttpServer());
  const authorization = (accessToken: string) => ({
    authorization: `Bearer ${accessToken}`,
  });
  const bearer = (session: TestSession) => authorization(session.accessToken);

  /** Signs in the way the web and mobile apps do: a Supabase access token, then GET /auth/me. */
  const sessionWith = async (identity: TestIdentity): Promise<TestSession> => {
    const accessToken = await signAccessToken(identity);
    const user = (
      await http().get('/auth/me').set(authorization(accessToken)).expect(200)
    ).body as AuthUser;
    return { accessToken, user };
  };
  /** Session for a seeded account. Staff sessions are MFA-verified (aal2) unless stated. */
  const sessionFor = async (
    email: string,
    aal: 'aal1' | 'aal2' = 'aal2',
  ): Promise<TestSession> => {
    const account = await prisma.user.findUniqueOrThrow({
      where: { email },
      select: { id: true },
    });
    return sessionWith({ id: account.id, email, aal });
  };
  const tokenFromMail = (email: string, path: string): string => {
    const text = mail.lastMessageTo(email)?.text ?? '';
    const match = new RegExp(`${path}\\?token=([\\w-]+)`).exec(text);
    if (!match) throw new Error(`No ${path} link emailed to ${email}`);
    return match[1];
  };
  const product = async (
    sku: string,
    session?: TestSession,
  ): Promise<ProductDto> => {
    const req = http().get('/catalog/products').query({ search: sku });
    if (session) void req.set(bearer(session));
    const page = (await req.expect(200)).body as Paginated<ProductDto>;
    const found = page.items.find((p) => p.sku === sku);
    if (!found)
      throw new Error(`Seeded product ${sku} not found — run the seed first`);
    return found;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(IdentityAdminService)
      .useValue(identities)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app, app.get<AppConfig>(APP_CONFIG));
    await app.init();
    mail = app.get(MailService);
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('platform', () => {
    it('reports liveness and database readiness', async () => {
      await http().get('/health').expect(200);
      const ready = await http().get('/health/ready').expect(200);
      expect(ready.body).toMatchObject({ status: 'ok', database: 'up' });
    });

    it('returns a consistent error envelope with a request id', async () => {
      const res = await http()
        .post('/quote-requests')
        .send({ email: 'not-an-email' })
        .expect(400);
      expect(res.body).toMatchObject({ statusCode: 400, error: 'Bad Request' });
      expect(res.body.details.map((d: { path: string }) => d.path)).toEqual(
        expect.arrayContaining(['name', 'email', 'phone']),
      );
      expect(res.headers['x-request-id']).toBe(res.body.requestId);
    });

    it('keeps every table private to the API with row level security', async () => {
      const exposed = await prisma.$queryRaw<Array<{ tablename: string }>>`
        SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity`;
      expect(exposed).toEqual([]);
    });

    it('trusts a forwarded client address only from the web app', async () => {
      const item = await product('AX-EFS-002');
      const auditedAddress = async (headers: Record<string, string>) => {
        const receipt = (
          await http()
            .post('/quote-requests')
            .set(headers)
            .send({
              name: 'Proxy Check',
              email: unique('proxy'),
              phone: '+971 50 555 0100',
              items: [{ productId: item.id, quantity: 1 }],
            })
            .expect(201)
        ).body as WebsiteQuoteReceiptDto;
        const entry = await prisma.auditLog.findFirstOrThrow({
          where: {
            entityType: 'QuoteRequest',
            details: { path: ['number'], equals: receipt.number },
          },
        });
        return entry.ipAddress;
      };

      expect(
        await auditedAddress({
          'x-topflow-client-ip': '203.0.113.7',
          'x-topflow-internal-auth': process.env.INTERNAL_API_SECRET ?? '',
        }),
      ).toBe('203.0.113.7');
      expect(
        await auditedAddress({
          'x-topflow-client-ip': '203.0.113.7',
          'x-topflow-internal-auth':
            'not-the-internal-secret-not-the-internal-secret',
        }),
      ).not.toBe('203.0.113.7');
    });
  });

  describe('authentication with Supabase Auth', () => {
    it('provisions a platform account from a verified identity on first use', async () => {
      const id = randomUUID();
      const email = unique('retail');
      const identity: TestIdentity = {
        id,
        email,
        userMetadata: {
          full_name: 'E2E Retail Customer',
          phone_number: '+971 50 555 0101',
          email_verified: true,
        },
      };
      const { accessToken, user } = await sessionWith(identity);
      expect(user).toMatchObject({
        id,
        email,
        fullName: 'E2E Retail Customer',
        phoneNumber: '+971 50 555 0101',
        role: 'CUSTOMER',
        emailVerified: true,
        memberships: [],
        assuranceLevel: 'aal1',
        mfaRequired: false,
      });

      // The same session again neither duplicates the account nor the sign-in record.
      await http().get('/auth/me').set(authorization(accessToken)).expect(200);
      expect(
        await prisma.auditLog.count({
          where: { userId: id, action: 'auth.login' },
        }),
      ).toBe(1);
    });

    it('rejects missing, forged, expired and foreign tokens', async () => {
      const identity = { id: randomUUID(), email: unique('intruder') };
      await http().get('/auth/me').expect(401);
      await http()
        .get('/auth/me')
        .set(
          authorization(
            await signAccessToken({
              ...identity,
              secret: 'not-the-project-secret-not-the-project-secret',
            }),
          ),
        )
        .expect(401);
      const expired = await http()
        .get('/auth/me')
        .set(
          authorization(
            await signAccessToken({
              ...identity,
              expiresAt: Math.floor(Date.now() / 1000) - 60,
            }),
          ),
        )
        .expect(401);
      expect(expired.body.message).toMatch(/expired/);
      await http()
        .get('/auth/me')
        .set(
          authorization(
            await signAccessToken({
              ...identity,
              issuer: 'https://another-project.supabase.co/auth/v1',
            }),
          ),
        )
        .expect(401);
      expect(await prisma.user.count({ where: { id: identity.id } })).toBe(0);
    });

    it('requires two-factor authentication for the back office', async () => {
      const unverified = await sessionFor('sales@topflow.ae', 'aal1');
      expect(unverified.user).toMatchObject({
        mfaRequired: true,
        assuranceLevel: 'aal1',
      });
      const blocked = await http()
        .get('/admin/dashboard')
        .set(bearer(unverified))
        .expect(403);
      expect(blocked.body.code).toBe('MFA_REQUIRED');
      await http()
        .get('/admin/dashboard')
        .set(bearer(await sessionFor('sales@topflow.ae')))
        .expect(200);
    });

    it('invites staff through Supabase Auth and suspends accounts', async () => {
      const admin = await sessionFor('admin@topflow.ae');
      const email = unique('staff');
      const invited = (
        await http()
          .post('/admin/users')
          .set(bearer(admin))
          .send({
            email,
            fullName: 'E2E Warehouse Colleague',
            role: 'WAREHOUSE',
          })
          .expect(201)
      ).body as UserAdminDto;
      expect(invited).toMatchObject({
        email,
        role: 'WAREHOUSE',
        isActive: true,
        emailVerified: false,
      });
      expect(identities.invitations.at(-1)).toMatchObject({
        email,
        redirectTo: expect.stringContaining('/auth/set-password') as string,
      });
      await http()
        .post('/admin/users')
        .set(bearer(admin))
        .send({ email, fullName: 'Duplicate Colleague', role: 'SALES' })
        .expect(409);

      const colleague = await signAccessToken({
        id: invited.id,
        email,
        aal: 'aal2',
      });
      await http().get('/auth/me').set(authorization(colleague)).expect(200);
      await http()
        .patch(`/admin/users/${invited.id}`)
        .set(bearer(admin))
        .send({ isActive: false })
        .expect(200);
      expect(identities.suspended.has(invited.id)).toBe(true);
      const disabled = await http()
        .get('/auth/me')
        .set(authorization(colleague))
        .expect(401);
      expect(disabled.body.code).toBe('ACCOUNT_DISABLED');
    });

    it('accepts a team invitation only for the invited, signed-in email', async () => {
      const owner = await sessionFor('owner@desertbloom.ae');
      const organizationId = owner.user.memberships[0].organizationId;
      const email = unique('invitee');
      await http()
        .post('/org/invitations')
        .set(bearer(owner))
        .set('x-organization-id', organizationId)
        .send({ email, role: 'BUYER' })
        .expect(201);
      const token = tokenFromMail(email, 'invitations/accept');

      await http().post('/invitations/accept').send({ token }).expect(401);
      const stranger = await signAccessToken({
        id: randomUUID(),
        email: unique('stranger'),
      });
      await http()
        .post('/invitations/accept')
        .set(authorization(stranger))
        .send({ token })
        .expect(403);

      const invitee = await signAccessToken({
        id: randomUUID(),
        email,
        userMetadata: { full_name: 'E2E Invited Buyer' },
      });
      const accepted = await http()
        .post('/invitations/accept')
        .set(authorization(invitee))
        .send({ token })
        .expect(200);
      expect(accepted.body).toEqual({ organizationId });
      const me = (
        await http().get('/auth/me').set(authorization(invitee)).expect(200)
      ).body as AuthUser;
      expect(me.memberships).toEqual([
        expect.objectContaining({ organizationId, role: 'BUYER' }),
      ]);
    });
  });

  describe('authorization & multi-tenancy', () => {
    it('enforces role-based access to the back office', async () => {
      await http().get('/admin/dashboard').expect(401);
      await http()
        .get('/admin/dashboard')
        .set(bearer(await sessionFor('customer@example.com')))
        .expect(403);
      await http()
        .get('/admin/dashboard')
        .set(bearer(await sessionFor('sales@topflow.ae')))
        .expect(200);
      await http()
        .get('/admin/audit-logs')
        .set(bearer(await sessionFor('sales@topflow.ae')))
        .expect(403);
    });

    it('opens trade accounts from sign-up and from the account page', async () => {
      const fromSignUp = await sessionWith({
        id: randomUUID(),
        email: unique('founder'),
        userMetadata: {
          full_name: 'Signup Founder',
          organization: {
            name: 'Oasis Villas Landscaping',
            type: 'LANDSCAPING',
            tradeLicenseNumber: 'DED-E2E-SIGNUP',
          },
        },
      });
      expect(fromSignUp.user.memberships).toEqual([
        expect.objectContaining({
          organizationName: 'Oasis Villas Landscaping',
          role: 'OWNER',
          organizationStatus: 'PENDING_VERIFICATION',
        }),
      ]);

      const customer = await sessionWith({
        id: randomUUID(),
        email: unique('upgrade'),
      });
      const upgraded = (
        await http()
          .post('/me/organizations')
          .set(bearer(customer))
          .send({
            name: 'Palm Facility Services',
            type: 'FACILITY_MANAGEMENT',
            tradeLicenseNumber: 'DED-E2E-UPGRADE',
          })
          .expect(201)
      ).body as AuthUser;
      expect(upgraded.memberships).toEqual([
        expect.objectContaining({
          organizationName: 'Palm Facility Services',
          role: 'OWNER',
        }),
      ]);
    });

    it('isolates organizations from each other', async () => {
      const buyer = await sessionFor('buyer@desertbloom.ae');
      const desertBloomId = buyer.user.memberships[0].organizationId;

      const owner = await sessionWith({
        id: randomUUID(),
        email: unique('owner'),
        userMetadata: {
          full_name: 'Rival Owner',
          organization: {
            name: 'Rival Landscaping',
            type: 'LANDSCAPING',
            tradeLicenseNumber: 'DED-E2E',
          },
        },
      });
      const rivalId = owner.user.memberships[0].organizationId;

      await http()
        .get('/org')
        .set(bearer(owner))
        .set('x-organization-id', desertBloomId)
        .expect(403);
      await http()
        .get('/org/orders')
        .set(bearer(buyer))
        .set('x-organization-id', rivalId)
        .expect(403);
      const own = await http()
        .get('/org')
        .set(bearer(owner))
        .set('x-organization-id', rivalId)
        .expect(200);
      expect(own.body.name).toBe('Rival Landscaping');
    });
  });

  describe('B2B procurement', () => {
    async function quoteAndSend(
      buyer: TestSession,
      sku: string,
      quantity: number,
    ): Promise<QuotationDto> {
      const org = buyer.user.memberships[0].organizationId;
      const item = await product(sku, buyer);
      const rfq = (
        await http()
          .post('/org/rfqs')
          .set(bearer(buyer))
          .set('x-organization-id', org)
          .send({
            items: [{ productId: item.id, quantity }],
            projectReference: 'E2E project',
          })
          .expect(201)
      ).body as RfqDto;
      const sales = await sessionFor('sales@topflow.ae');
      const draft = (
        await http()
          .post('/admin/quotations')
          .set(bearer(sales))
          .send({
            quoteRequestId: rfq.id,
            items: [{ productId: item.id, quantity }],
            validityDays: 7,
          })
          .expect(201)
      ).body as QuotationDto;
      return (
        await http()
          .post(`/admin/quotations/${draft.id}/send`)
          .set(bearer(sales))
          .expect(200)
      ).body as QuotationDto;
    }

    it('lets a buyer accept a quotation within their limit and creates the sales order', async () => {
      const buyer = await sessionFor('buyer@desertbloom.ae');
      const org = buyer.user.memberships[0].organizationId;
      const quotation = await quoteAndSend(buyer, 'AX-EFS-001', 20);

      const accepted = (
        await http()
          .post(`/org/quotations/${quotation.id}/respond`)
          .set(bearer(buyer))
          .set('x-organization-id', org)
          .send({ action: 'ACCEPT', purchaseOrderNumber: 'E2E-PO-1' })
          .expect(200)
      ).body as QuotationDto;
      expect(accepted.status).toBe('ACCEPTED');
      expect(accepted.orderNumber).toMatch(/^TF-SO-\d{4}-\d{6}$/);

      const order = (
        await http()
          .get(`/org/orders/${accepted.orderId}`)
          .set(bearer(buyer))
          .set('x-organization-id', org)
          .expect(200)
      ).body as OrderDto;
      expect(order).toMatchObject({
        channel: 'B2B',
        purchaseOrderNumber: 'E2E-PO-1',
        totalAmount: accepted.total,
      });
    });

    it('routes purchases above the buyer limit to an approver (segregation of duties)', async () => {
      const buyer = await sessionFor('buyer@desertbloom.ae');
      const approver = await sessionFor('approver@desertbloom.ae');
      const org = buyer.user.memberships[0].organizationId;
      const quotation = await quoteAndSend(buyer, 'AX-EFS-003', 160);

      const pending = (
        await http()
          .post(`/org/quotations/${quotation.id}/respond`)
          .set(bearer(buyer))
          .set('x-organization-id', org)
          .send({ action: 'ACCEPT' })
          .expect(200)
      ).body as QuotationDto;
      expect(pending.status).toBe('PENDING_APPROVAL');
      await http()
        .post(`/org/quotations/${quotation.id}/approval`)
        .set(bearer(buyer))
        .set('x-organization-id', org)
        .send({ decision: 'APPROVE' })
        .expect(403);

      const approved = (
        await http()
          .post(`/org/quotations/${quotation.id}/approval`)
          .set(bearer(approver))
          .set('x-organization-id', org)
          .send({ decision: 'APPROVE' })
          .expect(200)
      ).body as QuotationDto;
      expect(approved).toMatchObject({
        status: 'ACCEPTED',
        approvedBy: { fullName: 'Fatima Noor' },
      });
      expect(approved.orderId).toBeTruthy();
    });
  });

  describe('catalog & website quote requests', () => {
    it('exposes indicative price ranges and counts sub-category products under their parent', async () => {
      const item = await product('AX-EFS-002');
      expect(item.priceRange).not.toBeNull();
      const range = item.priceRange!;
      expect(Number(range.min)).toBeLessThanOrEqual(Number(range.max));
      expect(Number(range.retailMax)).toBeGreaterThan(Number(range.max));
      expect(item.unitPrice).toBe(range.max);

      const categories = (await http().get('/catalog/categories').expect(200))
        .body as CategoryDto[];
      const parent = categories.find(
        (c) => c.slug === 'electrofusion-hdpe-fittings',
      );
      const lines = categories.filter((c) => c.parentId === parent?.id);
      expect(lines.length).toBeGreaterThan(0);
      expect(parent?.productCount).toBe(
        lines.reduce((sum, line) => sum + (line.productCount ?? 0), 0),
      );
    });

    it('accepts a quote request from a website visitor and shows it to sales', async () => {
      const item = await product('AX-EFS-002');
      const email = unique('visitor');
      const requiredBy = daysFromNow(10);
      const receipt = (
        await http()
          .post('/quote-requests')
          .send({
            name: 'Website Visitor',
            email,
            phone: '+971 50 555 0199',
            companyName: 'Oasis Villas',
            emirate: 'DUBAI',
            preferredContact: 'WHATSAPP',
            projectReference: 'Villa 12 garden',
            requiredBy,
            items: [
              {
                productId: item.id,
                quantity: 12,
                notes: 'Or an equivalent brand',
              },
            ],
          })
          .expect(201)
      ).body as WebsiteQuoteReceiptDto;
      expect(receipt).toMatchObject({
        lineCount: 1,
        number: expect.stringMatching(/^TF-RFQ-\d{4}-\d{6}$/) as string,
      });
      expect(mail.lastMessageTo(email)?.subject).toContain(receipt.number);

      const sales = await sessionFor('sales@topflow.ae');
      const inbox = (
        await http()
          .get('/admin/rfqs')
          .query({ source: 'WEBSITE', search: email })
          .set(bearer(sales))
          .expect(200)
      ).body as Paginated<RfqDto>;
      expect(inbox.items[0]).toMatchObject({
        number: receipt.number,
        source: 'WEBSITE',
        organization: null,
        projectReference: 'Villa 12 garden',
        contact: {
          name: 'Website Visitor',
          email,
          companyName: 'Oasis Villas',
          preferredContact: 'WHATSAPP',
        },
        items: [
          expect.objectContaining({
            quantity: 12,
            notes: 'Or an equivalent brand',
          }),
        ],
      });

      await http()
        .post('/quote-requests')
        .send({
          name: 'No Phone',
          email: unique('visitor'),
          items: [{ productId: item.id, quantity: 1 }],
        })
        .expect(400);
    });

    it('accepts a project enquiry without products and refuses past dates', async () => {
      const email = unique('enquiry');
      const notes =
        'Irrigation for a 5,000 m² community park in Sharjah; BOQ available on request.';
      const receipt = (
        await http()
          .post('/quote-requests')
          .send({
            name: 'Project Enquirer',
            email,
            phone: '+971 50 555 0142',
            preferredContact: 'EMAIL',
            notes,
          })
          .expect(201)
      ).body as WebsiteQuoteReceiptDto;
      expect(receipt.lineCount).toBe(0);
      expect(mail.lastMessageTo(email)?.text).toContain('project enquiry');

      await http()
        .post('/quote-requests')
        .send({
          name: 'Late Enquirer',
          email: unique('late'),
          phone: '+971 50 555 0143',
          notes,
          requiredBy: '2020-01-01',
        })
        .expect(400);
      await http()
        .post('/quote-requests')
        .send({
          name: 'Vague Enquirer',
          email: unique('vague'),
          phone: '+971 50 555 0144',
          notes: 'Need pipes',
        })
        .expect(400);
    });
  });

  describe('retail orders', () => {
    it('prices checkout on the server and moves the order through fulfilment', async () => {
      const customer = await sessionFor('customer@example.com');
      const warehouse = await sessionFor('warehouse@topflow.ae');
      const addresses = (
        await http().get('/me/addresses').set(bearer(customer)).expect(200)
      ).body as AddressDto[];
      const fitting = await product('AX-EFS-002');

      const order = (
        await http()
          .post('/me/orders')
          .set(bearer(customer))
          .send({
            items: [{ productId: fitting.id, quantity: 2, unitPrice: '0.01' }],
            addressId: addresses[0].id,
            paymentMethod: 'CASH_ON_DELIVERY',
          })
          .expect(201)
      ).body as OrderDto;
      // Expected totals come from the catalog price, not the price the client tried to send.
      const netSubtotal = toFils(fitting.unitPrice) * 2;
      const expected = calculateTotals(
        [{ listPriceFils: toFils(fitting.unitPrice), quantity: 2 }],
        { deliveryFeeFils: retailDeliveryFeeFils(netSubtotal) },
      );
      expect(order).toMatchObject({
        status: 'CONFIRMED',
        subtotal: fromFils(expected.subtotalFils),
        deliveryFee: fromFils(expected.deliveryFeeFils),
        vatAmount: fromFils(expected.vatFils),
        totalAmount: fromFils(expected.totalFils),
      });

      for (const [status, extra] of [
        ['PROCESSING', {}],
        ['DISPATCHED', { trackingReference: 'E2E-TRACK' }],
        ['DELIVERED', {}],
      ] as const) {
        await http()
          .patch(`/admin/orders/${order.id}/status`)
          .set(bearer(warehouse))
          .send({ status, ...extra })
          .expect(200);
      }
      const delivered = (
        await http()
          .get(`/me/orders/${order.id}`)
          .set(bearer(customer))
          .expect(200)
      ).body as OrderDto;
      expect(delivered).toMatchObject({
        status: 'DELIVERED',
        paymentStatus: 'PAID',
        trackingReference: 'E2E-TRACK',
      });
      expect((await product('AX-EFS-002')).stockQuantity).toBe(
        fitting.stockQuantity - 2,
      );
    });
  });
});
