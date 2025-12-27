import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Tenant } from '../../database/entities/core/tenant.entity';

export const TenantContext = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): Tenant => {
    const request = ctx.switchToHttp().getRequest();
    return request.tenant;
  },
);
