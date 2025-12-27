import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ObservabilityModule } from '../observability/observability.module';
import { SecurityModule } from '../security/security.module';
import { QueuesModule } from '../queues/queues.module';

// ✅ Needed so TenantResolutionGuard can resolve TenantsService in this module context
import { TenantsModule } from '../modules/core/tenants/tenants.module';

import { WhatsAppWebhookController } from './whatsapp-webhook.controller';

import { WhatsAppAdapter } from './whatsapp.adapter';

// ✅ ADD: controller depends on this
import { WhatsAppService } from './whatsapp.service';

// >>> ADD START: outbound sender service >>>
import { WhatsAppSenderService } from './whatsapp.sender.service';
// <<< ADD END <<<

@Module({
  imports: [
    // Needed for ConfigService inside WhatsAppAdapter (even though ConfigModule is global)
    ConfigModule,

    // Needed for LoggerService injection
    ObservabilityModule,

    // ✅ Required for TenantResolutionGuard -> TenantsService DI
    TenantsModule,

    // Needed for signature guard/service (Phase 0/1 pattern)
    SecurityModule,

    // Needed so webhook can enqueue jobs (if your controller does that)
    QueuesModule,
  ],
  controllers: [WhatsAppWebhookController],
  providers: [
    WhatsAppAdapter,
    // ✅ ADD
    WhatsAppService,

    // >>> ADD START: outbound sender provider >>>
    WhatsAppSenderService,
    // <<< ADD END <<<
  ],
  exports: [
    WhatsAppAdapter,
    // ✅ ADD (safe; helps later if other modules need to call WhatsAppService)
    WhatsAppService,

    // >>> ADD START: export sender for OutboundProcessor DI >>>
    WhatsAppSenderService,
    // <<< ADD END <<<
  ],
})
export class WhatsAppModule {}
