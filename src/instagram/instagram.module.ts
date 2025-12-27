import { Module } from '@nestjs/common';

// >>> ADD START: needed for SenderService DI >>>
import { ConfigModule } from '@nestjs/config';
import { ObservabilityModule } from '../observability/observability.module';
import { InstagramSenderService } from './instagram.sender.service';
// <<< ADD END <<<

import { InstagramWebhookController } from './instagram-webhook.controller';
import { InstagramAdapter } from './instagram.adapter';

import { QueuesModule } from '../queues/queues.module';

@Module({
  imports: [
    QueuesModule,

    // >>> ADD START: needed for ConfigService + LoggerService in sender >>>
    ConfigModule,
    ObservabilityModule,
    // <<< ADD END <<<
  ],
  controllers: [InstagramWebhookController],
  providers: [
    InstagramAdapter,

    // >>> ADD START: outbound sender provider >>>
    InstagramSenderService,
    // <<< ADD END <<<
  ],
  exports: [
    InstagramAdapter, // ✅ REQUIRED

    // >>> ADD START: export sender for OutboundProcessor DI >>>
    InstagramSenderService,
    // <<< ADD END <<<
  ],
})
export class InstagramModule {}
