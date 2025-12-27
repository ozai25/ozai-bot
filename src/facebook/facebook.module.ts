import { Module } from '@nestjs/common';

import { FacebookWebhookController } from './facebook-webhook.controller';
import { FacebookAdapter } from './facebook.adapter';
import { FacebookSenderService } from './facebook.sender.service'; // ✅ ADD

import { QueuesModule } from '../queues/queues.module';

@Module({
  imports: [
    QueuesModule,
  ],
  controllers: [FacebookWebhookController],
  providers: [
    FacebookAdapter,
    FacebookSenderService, // ✅ ADD
  ],
  exports: [
    FacebookAdapter,
    FacebookSenderService, // ✅ ADD (so ProcessorsModule can inject it)
  ],
})
export class FacebookModule {}
