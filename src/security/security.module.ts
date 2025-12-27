// src/security/security.module.ts
import { Module } from '@nestjs/common';

import { TenantResolutionGuard } from './tenant-resolution.guard';
import { WhatsAppSignatureService } from './whatsapp-signature.service';

// IMPORTANT: This module must export TenantsService
import { TenantsModule } from '../modules/core/tenants/tenants.module';

// ✅ ADD
import { PiiRedactorService } from './pii-redactor.service';

// ✅ ADD: global rate limiting
import { RateLimitModule } from './rate-limit.module';

// ✅ ADD: ensure AdminThrottlerGuard is resolvable anywhere SecurityModule is used
import { AdminThrottlerGuard } from './admin-throttler.guard';

@Module({
  imports: [
    TenantsModule, // <-- gives SecurityModule access to TenantsService

    // ✅ ADD
    RateLimitModule,
  ],
  providers: [
    TenantResolutionGuard,
    WhatsAppSignatureService,

    // ✅ ADD
    PiiRedactorService,

    // ✅ ADD: make guard explicitly available through SecurityModule as well (belt + suspenders)
    AdminThrottlerGuard,
  ],
  exports: [
    TenantResolutionGuard,
    WhatsAppSignatureService,

    // ✅ ADD
    PiiRedactorService,

    // ✅ ADD: export ThrottlerModule via RateLimitModule
    RateLimitModule,

    // ✅ ADD: allow other modules to @UseGuards(AdminThrottlerGuard) without module-import ambiguity
    AdminThrottlerGuard,
  ],
})
export class SecurityModule {}
