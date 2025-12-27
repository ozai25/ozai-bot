import { Tenant } from '../database/entities/core/tenant.entity';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      tenantSlug?: string;
      tenant?: Tenant;
    }
  }
}

export {};
