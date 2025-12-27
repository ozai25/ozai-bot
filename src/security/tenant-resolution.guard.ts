import {
  Injectable,
  CanActivate,
  ExecutionContext,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { Request } from 'express';
import { TenantsService } from '../modules/core/tenants/tenants.service';
import { LoggerService } from '../observability/logger.service';

@Injectable()
export class TenantResolutionGuard implements CanActivate {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly logger: LoggerService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    
    // Extract tenantSlug from URL params
    const tenantSlug = request.params.tenantSlug || request['tenantSlug'];

    if (!tenantSlug) {
      this.logger.warn('Tenant slug missing from request', 'TenantResolutionGuard');
      throw new NotFoundException('Tenant identifier is required');
    }

    // Fetch tenant from database (with caching)
    const tenant = await this.tenantsService.findBySlug(tenantSlug);

    if (!tenant) {
      this.logger.warn(
        `Tenant not found: ${tenantSlug}`,
        'TenantResolutionGuard',
      );
      throw new NotFoundException(`Tenant '${tenantSlug}' not found`);
    }

    if (!tenant.isActive) {
      this.logger.warn(
        `Inactive tenant accessed: ${tenantSlug}`,
        'TenantResolutionGuard',
      );
      throw new NotFoundException(`Tenant '${tenantSlug}' is not active`);
    }

    // Attach tenant to request for downstream use
    request['tenant'] = tenant;

    // Update logger context
    this.logger.setContext({ tenantSlug: tenant.slug });

    this.logger.debug(
      `Tenant resolved: ${tenant.slug} (${tenant.name})`,
      'TenantResolutionGuard',
    );

    return true;
  }
}
