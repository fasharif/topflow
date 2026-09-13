import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type {
  AddressDto,
  AuthSession,
  OrderDto,
  Paginated,
  ProductDto,
  QuotationDto,
  RfqDto,
} from '@topflow/shared';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { APP_CONFIG } from '../src/config/config.module';
import type { AppConfig } from '../src/config/env';
import { MailService } from '../src/mail/mail.service';

const PASSWORD = 'TopFlow2026!';
const unique = (prefix: string) =>
  `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@e2e.topflow.test`;

describe('Top Flow API (e2e)', () => {
  let app: INestApplication;
  let mail: MailService;

  const http = () => request(app.getHttpServer());
  const login = async (
    email: string,
    password = PASSWORD,
  ): Promise<AuthSession> =>
    (
      await http()
        .post('/auth/login')
        .set('x-client-platform', 'mobile')
        .send({ email, password })
        .expect(200)
    ).body as AuthSession;
  const bearer = (session: AuthSession) => ({
    authorization: `Bearer ${session.accessToken}`,
  });
  const tokenFromMail = (email: string, path: string): string => {
    const text = mail.lastMessageTo(email)?.text ?? '';
    const match = new RegExp(`${path}\\?token=([\\w-]+)`).exec(text);
    if (!match) throw new Error(`No ${path} link emailed to ${email}`);
    return match[1];
  };
  const product = async (
    sku: string,
    session?: AuthSession,
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
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, app.get<AppConfig>(APP_CONFIG));
    await app.init();
    mail = app.get(MailService);
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
        .post('/auth/login')
        .send({ email: 'not-an-email' })
        .expect(400);
      expect(res.body).toMatchObject({ statusCode: 400, error: 'Bad Request' });
      expect(res.body.details.map((d: { path: string }) => d.path)).toEqual(
        expect.arrayContaining(['email', 'password']),
      );
      expect(res.headers['x-request-id']).toBe(res.body.requestId);
    });
  });

  describe('authentication', () => {
    it('registers, verifies email, rotates refresh tokens and revokes sessions on logout', async () => {
      const email = unique('retail');
      const registered = await http()
        .post('/auth/register')
        .set('x-client-platform', 'mobile')
        .send({ email, password: PASSWORD, fullName: 'E2E Retail Customer' })
        .expect(201);
      const session = registered.body as AuthSession;
      expect(session.user).toMatchObject({
        email,
        role: 'CUSTOMER',
        emailVerified: false,
      });
      expect(session.refreshToken).toBeDefined();

      await http()
        .post('/auth/email/verify')
        .send({ token: tokenFromMail(email, 'verify-email') })
        .expect(204);
      const me = await http().get('/auth/me').set(bearer(session)).expect(200);
      expect(me.body.emailVerified).toBe(true);

      const rotated = (
        await http()
          .post('/auth/refresh')
          .send({ refreshToken: session.refreshToken })
          .set('x-client-platform', 'mobile')
          .expect(200)
      ).body as AuthSession;
      expect(rotated.refreshToken).not.toBe(session.refreshToken);

      await http()
        .post('/auth/logout')
        .send({ refreshToken: rotated.refreshToken })
        .expect(204);
      await http()
        .post('/auth/refresh')
        .send({ refreshToken: rotated.refreshToken })
        .expect(401);
    });

    it('delivers refresh tokens to browsers only as an httpOnly cookie', async () => {
      const res = await http()
        .post('/auth/login')
        .send({ email: 'customer@example.com', password: PASSWORD })
        .expect(200);
      expect(res.body.refreshToken).toBeUndefined();
      const cookie = String(res.headers['set-cookie']);
      expect(cookie).toMatch(/tf_refresh=.+HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Lax/i);

      await http()
        .post('/auth/refresh')
        .set('cookie', cookie.split(';')[0])
        .send({})
        .expect(200);
    });

    it('resets a forgotten password and signs out existing sessions', async () => {
      const email = unique('reset');
      const original = (
        await http()
          .post('/auth/register')
          .set('x-client-platform', 'mobile')
          .send({ email, password: PASSWORD, fullName: 'Reset Tester' })
          .expect(201)
      ).body as AuthSession;

      await http().post('/auth/password/forgot').send({ email }).expect(204);
      await http()
        .post('/auth/password/forgot')
        .send({ email: unique('nobody') })
        .expect(204); // no account enumeration
      await http()
        .post('/auth/password/reset')
        .send({
          token: tokenFromMail(email, 'reset-password'),
          password: 'NewIrrigation99',
        })
        .expect(204);

      await http()
        .post('/auth/refresh')
        .send({ refreshToken: original.refreshToken })
        .expect(401);
      await http()
        .post('/auth/login')
        .send({ email, password: PASSWORD })
        .expect(401);
      await login(email, 'NewIrrigation99');
    });
  });

  describe('authorization & multi-tenancy', () => {
    it('enforces role-based access to the back office', async () => {
      await http().get('/admin/dashboard').expect(401);
      await http()
        .get('/admin/dashboard')
        .set(bearer(await login('customer@example.com')))
        .expect(403);
      await http()
        .get('/admin/dashboard')
        .set(bearer(await login('sales@topflow.ae')))
        .expect(200);
      await http()
        .get('/admin/audit-logs')
        .set(bearer(await login('sales@topflow.ae')))
        .expect(403);
    });

    it('isolates organizations from each other', async () => {
      const buyer = await login('buyer@desertbloom.ae');
      const desertBloomId = buyer.user.memberships[0].organizationId;

      const owner = (
        await http()
          .post('/auth/register/business')
          .set('x-client-platform', 'mobile')
          .send({
            email: unique('owner'),
            password: PASSWORD,
            fullName: 'Rival Owner',
            organization: {
              name: 'Rival Landscaping',
              type: 'LANDSCAPING',
              tradeLicenseNumber: 'DED-E2E',
            },
          })
          .expect(201)
      ).body as AuthSession;
      const rivalId = owner.user.memberships[0].organizationId;
      expect(owner.user.memberships[0]).toMatchObject({
        role: 'OWNER',
        organizationStatus: 'PENDING_VERIFICATION',
      });

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
      buyer: AuthSession,
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
      const sales = await login('sales@topflow.ae');
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
      const buyer = await login('buyer@desertbloom.ae');
      const org = buyer.user.memberships[0].organizationId;
      const quotation = await quoteAndSend(buyer, 'PVC-ELB-32', 20);

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
      const buyer = await login('buyer@desertbloom.ae');
      const approver = await login('approver@desertbloom.ae');
      const org = buyer.user.memberships[0].organizationId;
      const quotation = await quoteAndSend(buyer, 'HU-PGP-ADJ', 160);

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

  describe('retail orders', () => {
    it('prices checkout on the server and moves the order through fulfilment', async () => {
      const customer = await login('customer@example.com');
      const warehouse = await login('warehouse@topflow.ae');
      const addresses = (
        await http().get('/me/addresses').set(bearer(customer)).expect(200)
      ).body as AddressDto[];
      const rotor = await product('RB-5004-PC');

      const order = (
        await http()
          .post('/me/orders')
          .set(bearer(customer))
          .send({
            items: [{ productId: rotor.id, quantity: 2, unitPrice: '0.01' }],
            addressId: addresses[0].id,
            paymentMethod: 'CASH_ON_DELIVERY',
          })
          .expect(201)
      ).body as OrderDto;
      expect(order).toMatchObject({
        status: 'CONFIRMED',
        subtotal: '84.00',
        deliveryFee: '25.00',
        vatAmount: '5.45',
        totalAmount: '114.45',
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
      expect((await product('RB-5004-PC')).stockQuantity).toBe(
        rotor.stockQuantity - 2,
      );
    });
  });
});
