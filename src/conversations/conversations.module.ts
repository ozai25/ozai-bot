import { Module } from '@nestjs/common';

import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';

// ✅ ADD: provides TenantsService
import { TenantsModule } from '../modules/core/tenants/tenants.module';

// ✅ ADD: provides PiiRedactorService
import { SecurityModule } from '../security/security.module';

@Module({
  imports: [
    // ✅ ADD
    TenantsModule,

    // ✅ ADD
    SecurityModule,
  ],
  controllers: [ConversationsController],
  providers: [ConversationsService],
  exports: [ConversationsService],
})
export class ConversationsModule {}
