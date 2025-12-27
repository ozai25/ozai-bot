import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { TenantsService } from '../src/modules/core/tenants/tenants.service';
async function main(): Promise<void> {
  const logger = new Logger('SeedDefaultTenants');

  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
  });

  try {
    const tenants = app.get(TenantsService);
    await tenants.seedDefaults();
    logger.log('✅ Default tenants seed completed successfully');
  } catch (e: any) {
    logger.error(
      `❌ Default tenants seed failed: ${e?.message ?? 'unknown_error'}`,
      e?.stack,
    );
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void main();
