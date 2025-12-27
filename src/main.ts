// src/main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import * as express from 'express';

import { AppModule } from './app.module';
import { LoggerService } from './observability/logger.service';
import { TenantsService } from './modules/core/tenants/tenants.service';
import { AuditInterceptor } from './observability/audit.interceptor';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // Disable default bodyParser so we control rawBody capture for webhooks
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });

  // Use custom logger
  const customLogger = app.get(LoggerService);
  app.useLogger(customLogger);

  // 1) RAW BODY PARSER (Webhooks Only) - must run first
  app.use(
    '/webhooks/*',
    express.raw({
      type: 'application/json',
      verify: (req: any, _res, buf) => {
        if (buf?.length) req.rawBody = buf;
        return true;
      },
    }),
  );

  // 2) Standard parsers for non-webhook routes
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global audit logging
  app.useGlobalInterceptors(app.get(AuditInterceptor));

  // CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-Id',
      'x-hub-signature-256',
      'x-admin-key',
    ],
  });

  // Shutdown hooks (Nest)
  app.enableShutdownHooks();

  const port = Number.parseInt(String(process.env.PORT ?? '3000'), 10);
  await app.listen(port, '0.0.0.0');

  logger.log(`✅ Listening on 0.0.0.0:${port}`);

  // DEV-only tenant seed (non-fatal)
  if (process.env.NODE_ENV !== 'production') {
    const tenantsService = app.get(TenantsService);

    try {
      await tenantsService.seedDefaults();
      logger.log('Default tenants seeded (dev-only)');
    } catch (e: any) {
      logger.warn(
        `Default tenant seed skipped (non-fatal): ${e?.message ?? 'unknown_error'}`,
      );
    }
  }

  logger.log(`🚀 OZAIBOT is running on: http://localhost:${port}`);
  logger.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.log(`🏥 Health checks: http://localhost:${port}/health/liveness`);

  // Signal handling (avoid double-close)
  let shuttingDown = false;
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, async () => {
      if (shuttingDown) return;
      shuttingDown = true;

      logger.log(`Received ${signal}, starting graceful shutdown...`);
      try {
        await app.close();
      } catch (e: any) {
        logger.warn(`Graceful shutdown encountered error: ${e?.message ?? 'unknown_error'}`);
      }
      logger.log('Application shut down successfully');
      process.exit(0);
    });
  }
}

void bootstrap();
