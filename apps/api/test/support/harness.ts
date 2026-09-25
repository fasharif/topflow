import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  ORGANIZATION_HEADER,
  type AuthUser,
  type Paginated,
  type ProductDto,
} from '@topflow/shared';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { IdentityAdminService } from '../../src/auth/identity-admin.service';
import { configureApp } from '../../src/bootstrap';
import { APP_CONFIG } from '../../src/config/config.module';
import type { AppConfig } from '../../src/config/env';
import { MailService } from '../../src/mail/mail.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  FakeIdentityAdmin,
  signAccessToken,
  type TestIdentity,
} from './supabase';

export interface TestSession {
  accessToken: string;
  user: AuthUser;
}

export const uniqueEmail = (prefix: string): string =>
  `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@e2e.topflow.test`;

/**
 * The real application (production middleware stack, real PostgreSQL) with Supabase Auth
 * simulated: tokens are signed locally and the Auth admin API is an in-memory fake. Spec files
 * start one harness in beforeAll and stop it in afterAll.
 */
export class E2eHarness {
  readonly identities = new FakeIdentityAdmin();
  private nest?: INestApplication;

  async start(): Promise<void> {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(IdentityAdminService)
      .useValue(this.identities)
      .compile();
    this.nest = moduleRef.createNestApplication();
    configureApp(this.nest, this.nest.get<AppConfig>(APP_CONFIG));
    await this.nest.init();
  }

  async stop(): Promise<void> {
    await this.nest?.close();
  }

  private get app(): INestApplication {
    if (!this.nest) throw new Error('Call start() in beforeAll first');
    return this.nest;
  }

  get prisma(): PrismaService {
    return this.app.get(PrismaService);
  }

  get mail(): MailService {
    return this.app.get(MailService);
  }

  http() {
    return request(this.app.getHttpServer());
  }

  bearer(session: TestSession): Record<string, string> {
    return { authorization: `Bearer ${session.accessToken}` };
  }

  /** Headers of a member acting inside one of their organizations (the trade portal). */
  member(session: TestSession, organizationId: string): Record<string, string> {
    return { ...this.bearer(session), [ORGANIZATION_HEADER]: organizationId };
  }

  /** Signs in the way the clients do: a Supabase access token, then GET /auth/me. */
  async sessionWith(identity: TestIdentity): Promise<TestSession> {
    const accessToken = await signAccessToken(identity);
    const response = await this.http()
      .get('/auth/me')
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200);
    return { accessToken, user: response.body as AuthUser };
  }

  /** Session for a seeded account; staff sessions are MFA-verified (aal2). */
  async sessionFor(email: string): Promise<TestSession> {
    const account = await this.prisma.user.findUniqueOrThrow({
      where: { email },
      select: { id: true },
    });
    return this.sessionWith({ id: account.id, email, aal: 'aal2' });
  }

  /** The token of the last link to `path` emailed to `email` (console mail transport). */
  tokenFromMail(email: string, path: string): string {
    const text = this.mail.lastMessageTo(email)?.text ?? '';
    const match = new RegExp(`${path}\\?token=([\\w-]+)`).exec(text);
    if (!match) throw new Error(`No ${path} link emailed to ${email}`);
    return match[1];
  }

  async product(sku: string): Promise<ProductDto> {
    const page = (
      await this.http()
        .get('/catalog/products')
        .query({ search: sku })
        .expect(200)
    ).body as Paginated<ProductDto>;
    const found = page.items.find((item) => item.sku === sku);
    if (!found)
      throw new Error(`Seeded product ${sku} not found: run the seed first`);
    return found;
  }
}
