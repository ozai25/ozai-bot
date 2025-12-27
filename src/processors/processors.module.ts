// src/processors/processors.module.ts
import { Module } from '@nestjs/common';

import { QueuesModule } from '../queues/queues.module';

import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { FacebookModule } from '../facebook/facebook.module';
import { InstagramModule } from '../instagram/instagram.module';

import { AiModule } from '../ai/ai.module';
import { AutomationModule } from '../automation/automation.module';
import { DatabaseModule } from '../database/database.module';
import { AlertsModule } from '../alerts/alerts.module';

import { MessageProcessor } from './message.processor';

// ✅ AUTHORITATIVE outbound worker
import { SendReplyProcessor } from './send-reply.processor';

// ✅ optional: startup tenant sync hook if you already created it
import { TenantSyncProcessor } from './tenant-sync.processor';

// ✅ ADD: required for TenantSyncProcessor -> TenantsService DI
import { TenantsModule } from '../modules/core/tenants/tenants.module';

@Module({
  imports: [
    QueuesModule,
    WhatsAppModule,
    FacebookModule,
    InstagramModule,
    AiModule,
    AutomationModule,
    DatabaseModule,
    AlertsModule,

    // ✅ ADD
    TenantsModule,
  ],
  providers: [
    MessageProcessor,

    // ✅ only ONE consumer for send-message
    SendReplyProcessor,

    // ✅ safe boot hook
    TenantSyncProcessor,
  ],
})
export class ProcessorsModule {}
