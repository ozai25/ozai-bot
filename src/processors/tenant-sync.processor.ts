// src/processors/tenant-sync.processor.ts
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { LoggerService } from '../observability/logger.service';
import { TenantsService } from '../modules/core/tenants/tenants.service';

@Injectable()
export class TenantSyncProcessor implements OnApplicationBootstrap {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly logger: LoggerService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const defaultTenant = String(process.env.DEFAULT_TENANT_SLUG ?? 'oz01')
      .trim()
      .toLowerCase();

    try {
      const tenant = await this.tenantsService.findBySlug(defaultTenant);

      this.logger.log(
        JSON.stringify({
          event: 'tenant_sync_primed',
          defaultTenant,
          found: Boolean(tenant),
          schemaName: tenant?.schemaName ?? null,
          isActive: tenant?.isActive ?? null,
          at: new Date().toISOString(),
        }),
        'TenantSyncProcessor',
      );
    } catch (e: any) {
      this.logger.warn(
        JSON.stringify({
          event: 'tenant_sync_prime_failed',
          defaultTenant,
          error: e?.message ?? 'unknown_error',
          at: new Date().toISOString(),
        }),
        'TenantSyncProcessor',
      );
      // Never block boot
    }
  }
}
