// Error reporting starts before anything else is imported (a no-op without SENTRY_DSN).
import './instrument';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { APP_CONFIG } from './config/config.module';
import type { AppConfig } from './config/env';

async function bootstrap(): Promise<void> {
  // rawBody: webhooks are verified against the exact bytes that were signed (ADR-024).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  const config = app.get<AppConfig>(APP_CONFIG);
  configureApp(app, config);

  await app.listen(config.port, '0.0.0.0');
  Logger.log(
    `Top Flow API v${config.app.version} listening on :${config.port} (${config.env}${config.demo.enabled ? ', demo mode' : ''})` +
      (config.http.swaggerEnabled ? ' — docs at /docs' : ''),
    'Bootstrap',
  );
}

void bootstrap();
