import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  DEMO_ACCOUNTS,
  type AuthUser,
  type Paginated,
  type ProductDto,
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

// The public portfolio demo (ADR-021) is the production code with DEMO_MODE=true. This suite boots
// the application in that mode against the seeded database. The hosted demo sends email through
// Resend, so the suite does too: the Resend API is replaced by a recorder at the fetch boundary,
// which shows exactly which addresses would have received a message.
process.env.DEMO_MODE = 'true';
process.env.DEMO_MAIL_ALLOWLIST = '@allowed.e2e.topflow.test';
process.env.STAFF_MFA_REQUIRED = 'false';
process.env.THROTTLE_LIMIT = '300';
process.env.AUTH_THROTTLE_LIMIT = '10';
process.env.MAIL_TRANSPORT = 'resend';
process.env.RESEND_API_KEY = 're_e2e_placeholder';

interface TestSession {
  accessToken: string;
  user: AuthUser;
}

const unique = (prefix: string, domain = 'e2e.topflow.test') =>
  `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@${domain}`;

describe('Public demo mode (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mail: MailService;
  const identities = new FakeIdentityAdmin();
  /** Recipients of every message that reached the (recorded) Resend API. */
  const delivered: string[] = [];

  const http = () => request(app.getHttpServer());
  const bearer = (session: TestSession) => ({
    authorization: `Bearer ${session.accessToken}`,
  });
  /** A distinct shopper address per test, forwarded by the web app's server as in production. */
  const shopper = (ip: string) => ({
    'x-topflow-client-ip': ip,
    'x-topflow-internal-auth': process.env.INTERNAL_API_SECRET ?? '',
  });

  const sessionWith = async (identity: TestIdentity): Promise<TestSession> => {
    const accessToken = await signAccessToken(identity);
    const user = (
      await http()
        .get('/auth/me')
        .set({ authorization: `Bearer ${accessToken}` })
        .expect(200)
    ).body as AuthUser;
    return { accessToken, user };
  };
  /** Demo visitors sign in with a password only: staff MFA is off in demo mode (aal1). */
  const sessionFor = async (email: string): Promise<TestSession> => {
    const account = await prisma.user.findUniqueOrThrow({
      where: { email },
      select: { id: true },
    });
    return sessionWith({ id: account.id, email, aal: 'aal1' });
  };
  const productId = async (sku: string): Promise<string> => {
    const page = (
      await http()
        .get('/catalog/products')
        .query({ search: sku })
        .set(shopper('198.51.100.1'))
        .expect(200)
    ).body as Paginated<ProductDto>;
    const found = page.items.find((p) => p.sku === sku);
    if (!found) throw new Error(`Seeded product ${sku} not found`);
    return found.id;
  };
  const websiteRequest = async (email: string, ip: string) =>
    (
      await http()
        .post('/quote-requests')
        .set(shopper(ip))
        .send({
          name: 'Demo Visitor',
          email,
          phone: '+971 50 555 0160',
          items: [{ productId: await productId('AX-EFS-002'), quantity: 2 }],
        })
        .expect(201)
    ).body as WebsiteQuoteReceiptDto;

  beforeAll(async () => {
    const realFetch = globalThis.fetch;
    jest.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url =
        input instanceof Request
          ? input.url
          : input instanceof URL
            ? input.href
            : input;
      if (!url.startsWith('https://api.resend.com/')) {
        return realFetch(input, init);
      }
      const body = JSON.parse((init as { body: string }).body) as {
        to: string[];
      };
      delivered.push(...body.to);
      return Promise.resolve(
        new Response('{"id":"e2e"}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(IdentityAdminService)
      .useValue(identities)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app, app.get<AppConfig>(APP_CONFIG));
    await app.init();
    prisma = app.get(PrismaService);
    mail = app.get(MailService);
  });

  afterAll(async () => {
    await app.close();
    jest.restoreAllMocks();
  });

  it('reports demo mode and seeds every published demo account', async () => {
    const root = await http().get('/').expect(200);
    expect(root.body).toMatchObject({ demo: true });

    const seeded = await prisma.user.findMany({
      where: { email: { in: DEMO_ACCOUNTS.map((account) => account.email) } },
      select: { email: true, isActive: true },
    });
    expect(seeded.map((user) => user.email).sort()).toEqual(
      DEMO_ACCOUNTS.map((account) => account.email).sort(),
    );
    expect(seeded.every((user) => user.isActive)).toBe(true);
  });

  it('withholds business email from visitors and from Top Flow', async () => {
    const visitor = unique('visitor');
    const withheldBefore = mail.withheld;
    const receipt = await websiteRequest(visitor, '198.51.100.10');

    // The request is accepted and reaches sales as usual...
    expect(receipt.number).toMatch(/^TF-RFQ-\d{4}-\d{6}$/);
    // ...but neither the acknowledgement nor the sales notification left the platform.
    expect(delivered).not.toContain(visitor);
    expect(delivered).not.toContain('info@topflow.ae');
    expect(mail.withheld - withheldBefore).toBe(2);
  });

  it('still delivers to allow-listed addresses', async () => {
    const reviewer = unique('reviewer', 'allowed.e2e.topflow.test');
    await websiteRequest(reviewer, '198.51.100.11');
    expect(delivered).toContain(reviewer);
    expect(delivered).not.toContain('info@topflow.ae');
  });

  it('withholds team invitation emails but keeps the invitation', async () => {
    const owner = await sessionFor('owner@desertbloom.ae');
    const organizationId = owner.user.memberships[0].organizationId;
    const invitee = unique('invitee');
    await http()
      .post('/org/invitations')
      .set(bearer(owner))
      .set('x-organization-id', organizationId)
      .send({ email: invitee, role: 'BUYER' })
      .expect(201);
    expect(delivered).not.toContain(invitee);
    expect(
      await prisma.organizationInvitation.count({
        where: { organizationId, email: invitee },
      }),
    ).toBe(1);
  });

  it('refuses staff invitations to addresses outside the allow-list', async () => {
    const admin = await sessionFor('admin@topflow.ae');
    const stranger = unique('staff');
    const invitationsBefore = identities.invitations.length;

    const refused = await http()
      .post('/admin/users')
      .set(bearer(admin))
      .send({ email: stranger, fullName: 'Demo Stranger', role: 'SALES' })
      .expect(403);
    expect(refused.body).toMatchObject({
      code: 'DEMO_RESTRICTED',
      message: expect.stringContaining('portfolio demo') as string,
    });
    expect(identities.invitations).toHaveLength(invitationsBefore);
    expect(await prisma.user.count({ where: { email: stranger } })).toBe(0);

    // The maintainer can still demonstrate the flow with an allow-listed address.
    const colleague = unique('colleague', 'allowed.e2e.topflow.test');
    const invited = (
      await http()
        .post('/admin/users')
        .set(bearer(admin))
        .send({
          email: colleague,
          fullName: 'Allowed Colleague',
          role: 'SALES',
        })
        .expect(201)
    ).body as UserAdminDto;
    expect(invited).toMatchObject({ email: colleague, role: 'SALES' });
    expect(identities.invitations.at(-1)).toMatchObject({ email: colleague });
  });

  it('refuses customer invitations from website requests outside the allow-list', async () => {
    const visitor = unique('lead');
    const receipt = await websiteRequest(visitor, '198.51.100.12');
    const sales = await sessionFor('sales@topflow.ae');
    const inbox = (
      await http()
        .get('/admin/rfqs')
        .query({ source: 'WEBSITE', search: receipt.number })
        .set(bearer(sales))
        .expect(200)
    ).body as Paginated<RfqDto>;
    const invitationsBefore = identities.invitations.length;

    const refused = await http()
      .post(`/admin/rfqs/${inbox.items[0].id}/customer`)
      .set(bearer(sales))
      .send({})
      .expect(403);
    expect(refused.body.code).toBe('DEMO_RESTRICTED');
    expect(identities.invitations).toHaveLength(invitationsBefore);
    expect(await prisma.user.count({ where: { email: visitor } })).toBe(0);
  });

  it('keeps the published demo accounts usable for every visitor', async () => {
    const admin = await sessionFor('admin@topflow.ae');
    const sales = await prisma.user.findUniqueOrThrow({
      where: { email: 'sales@topflow.ae' },
    });

    for (const change of [{ isActive: false }, { role: 'CUSTOMER' }]) {
      const refused = await http()
        .patch(`/admin/users/${sales.id}`)
        .set(bearer(admin))
        .send(change)
        .expect(403);
      expect(refused.body.code).toBe('DEMO_RESTRICTED');
    }
    expect(identities.suspended.has(sales.id)).toBe(false);
    expect(
      await prisma.user.findUniqueOrThrow({ where: { id: sales.id } }),
    ).toMatchObject({ role: 'SALES', isActive: true });

    // Other accounts can still be suspended, so the feature remains visible in the demo.
    const other = await sessionWith({
      id: randomUUID(),
      email: unique('shopper'),
      userMetadata: { full_name: 'Other Shopper' },
    });
    await http()
      .patch(`/admin/users/${other.user.id}`)
      .set(bearer(admin))
      .send({ isActive: false })
      .expect(200);
    expect(identities.suspended.has(other.user.id)).toBe(true);
  });

  it('keeps rate limits on for public forms', async () => {
    const limit = Number(process.env.AUTH_THROTTLE_LIMIT);
    const client = shopper('198.51.100.99');
    for (let attempt = 0; attempt < limit; attempt++) {
      // Invalid on purpose: the limit applies before validation, and nothing is stored.
      await http().post('/quote-requests').set(client).send({}).expect(400);
    }
    const limited = await http()
      .post('/quote-requests')
      .set(client)
      .send({})
      .expect(429);
    expect(limited.body.statusCode).toBe(429);
    // Another shopper is not affected.
    await http()
      .post('/quote-requests')
      .set(shopper('198.51.100.100'))
      .send({})
      .expect(400);
  });
});
