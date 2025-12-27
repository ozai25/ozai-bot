// src/observability/alerts-hub.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AlertsHubService {
  constructor(private readonly config: ConfigService) {}

  getHubTenantSlug(): string | null {
    const enabled = (this.config.get<string>('ALERTS_HUB_ENABLED') ?? 'false').toLowerCase() === 'true';
    if (!enabled) return null;

    const slug = (this.config.get<string>('ALERTS_HUB_TENANT_SLUG') ?? '').trim().toLowerCase();
    return slug ? slug : null;
  }

  shouldCopyAll(): boolean {
    return (this.config.get<string>('ALERTS_HUB_COPY_ALL') ?? 'false').toLowerCase() === 'true';
  }

  /**
   * If hub is enabled and configured, return the hub tenant to receive a copy.
   * Otherwise return null (no hub).
   */
  resolveHubCopyTarget(sourceTenantSlug: string): string | null {
    const hub = this.getHubTenantSlug();
    if (!hub) return null;

    const source = (sourceTenantSlug ?? '').toLowerCase();
    if (!source) return null;

    // Never “copy to self” if the source is already the hub
    if (source === hub) return null;

    // Copy-all toggle
    if (this.shouldCopyAll()) return hub;

    // If later you want “copy only some tenants”, add allowlist logic here (still add-only).
    return null;
  }
}
