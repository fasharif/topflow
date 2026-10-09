import type { INestApplication, NestApplicationOptions } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ORGANIZATION_HEADER } from '@topflow/shared';
import type { NextFunction, Response } from 'express';
import helmet from 'helmet';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { randomUUID } from 'node:crypto';
import { clientIp } from './common/client-ip';
import { documentErrorResponses } from './common/openapi';
import type { AppRequest } from './common/request-context';
import type { AppConfig } from './config/env';

function requestId(req: AppRequest, res: Response, next: NextFunction): void {
  const incoming = req.get('x-request-id');
  const id =
    incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  req.requestId = id;
  res.setHeader('x-request-id', id);
  next();
}

/**
 * The options every instance of the application is created with: main.ts and the end-to-end
 * tests pass the same object. rawBody keeps the exact bytes of a request body next to the parsed
 * one, because webhooks are verified against the bytes that were signed (ADR-024). Without it
 * the dispatch endpoint refuses every request for having no body.
 */
export const APP_OPTIONS: NestApplicationOptions = { rawBody: true };

/**
 * HTTP hardening shared by main.ts and the end-to-end tests, so tests exercise exactly
 * the middleware stack that runs in production.
 */
export function configureApp(app: INestApplication, config: AppConfig): void {
  const expressApp = app as NestExpressApplication;
  if (config.http.trustProxy) {
    expressApp.set('trust proxy', 1);
  }
  expressApp.disable('x-powered-by');
  expressApp.useBodyParser('json', { limit: '1mb' });

  app.use(requestId);
  app.use(clientIp(config.http.internalApiSecret));
  app.use(
    helmet({
      contentSecurityPolicy: config.http.swaggerEnabled ? false : undefined,
    }),
  );

  app.enableCors({
    // Browsers reach the API through the web app's server; direct cross-origin calls are limited
    // to an explicit allowlist. Native apps send no Origin. Authentication is by bearer token
    // only, so credentials (cookies) are never accepted cross-origin.
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      callback(null, !origin || config.http.corsOrigins.includes(origin));
    },
    credentials: false,
    allowedHeaders: [
      'authorization',
      'content-type',
      'x-request-id',
      ORGANIZATION_HEADER,
    ],
    exposedHeaders: ['x-request-id', 'content-disposition'],
  });

  app.enableShutdownHooks();

  if (config.http.swaggerEnabled) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('TopFlow Hub API')
        .setDescription(
          'REST API for the Top Flow B2B/B2C commerce platform. Authenticate with a Supabase Auth access token ' +
            `(Authorization: Bearer …); B2B endpoints under /org require the ${ORGANIZATION_HEADER} header.`,
        )
        .setVersion(config.app.version)
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup(
      'docs',
      app,
      documentErrorResponses(cleanupOpenApiDoc(document)),
    );
  }
}
