import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TenantContextService } from './services/tenant-context.service';
import { TenantsModule } from '../modules/core/tenants/tenants.module';

import { ConversationRepository } from '../repositories/conversation.repository';

// ✅ FIX: correct entity paths (they live in /entities/tenant)
import { Conversation } from './entities/tenant/conversation.entity';
import { Message } from './entities/tenant/message.entity';

@Module({
  imports: [
    TenantsModule,

    // ✅ CRITICAL: registers entity metadata for this module scope
    TypeOrmModule.forFeature([Conversation, Message]),
  ],
  providers: [TenantContextService, ConversationRepository],
  exports: [
    TenantContextService,
    ConversationRepository,
    TypeOrmModule, // ✅ optional but helpful if other modules import DatabaseModule
  ],
})
export class DatabaseModule {}
