import { Module } from '@nestjs/common';
import { QueuesModule } from '../queues/queues.module';
import { FacebookWebhookController } from '../facebook/facebook-webhook.controller';
import { FacebookAdapter } from '../facebook/facebook.adapter';

@Module({
  imports: [QueuesModule],
  controllers: [FacebookWebhookController],
  providers: [FacebookAdapter],
})
export class WebhooksModule {}
