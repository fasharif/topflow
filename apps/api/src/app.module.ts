import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ZodValidationPipe } from 'nestjs-zod';
import { AuditController } from './audit/audit.controller';
import { AuditModule } from './audit/audit.service';
import { AuthModule } from './auth/auth.module';
import {
  AuthenticationGuard,
  OrganizationGuard,
  PermissionsGuard,
} from './auth/guards';
import { CatalogModule } from './catalog/catalog.module';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { NumberingModule } from './common/numbering.service';
import { ClientThrottlerGuard } from './common/throttle';
import { StripNulPipe } from './common/strip-nul.pipe';
import { APP_CONFIG, ConfigModule } from './config/config.module';
import type { AppConfig } from './config/env';
import { DashboardModule } from './dashboard/dashboard.module';
import { DemoModule } from './demo/demo-policy';
import { HealthController } from './health/health.controller';
import { IntegrationsModule } from './integrations/integrations.module';
import { MailModule } from './mail/mail.service';
import { OrdersModule } from './orders/orders.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProcurementModule } from './procurement/procurement.module';
import { UsersModule } from './users/users.module';

/**
 * Modular monolith — one NestJS module per bounded context:
 *   identity (Auth, Users) · tenancy (Organizations) · Catalog · Procurement (RFQ/quotations)
 *   · Orders (checkout/fulfilment) · back office (Dashboard, Audit) · Integrations (dispatch).
 */
@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    ThrottlerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => [
        {
          name: 'default',
          ttl: config.throttle.ttlMs,
          limit: config.throttle.limit,
        },
      ],
    }),
    MailModule,
    DemoModule,
    AuditModule,
    NumberingModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    CatalogModule,
    OrdersModule,
    ProcurementModule,
    DashboardModule,
    IntegrationsModule,
  ],
  controllers: [HealthController, AuditController],
  providers: [
    // Pipes run in this order: NUL characters are removed before Zod validates the input.
    { provide: APP_PIPE, useClass: StripNulPipe },
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    // Guards run in registration order: rate limit → authenticate → authorise → tenant.
    { provide: APP_GUARD, useClass: ClientThrottlerGuard },
    { provide: APP_GUARD, useExisting: AuthenticationGuard },
    { provide: APP_GUARD, useExisting: PermissionsGuard },
    { provide: APP_GUARD, useExisting: OrganizationGuard },
  ],
})
export class AppModule {}
