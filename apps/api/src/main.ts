// Error reporting starts before anything else is imported (a no-op without SENTRY_DSN).
import './instrument';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { APP_OPTIONS, configureApp } from './bootstrap';
import { APP_CONFIG } from './config/config.module';
import type { AppConfig } from './config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    APP_OPTIONS,
  );
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
