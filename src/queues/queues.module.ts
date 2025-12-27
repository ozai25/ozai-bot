import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { InboundProducer } from './producers/inbound.producer';
import { OutboundProducer } from './producers/outbound.producer'; // ✅ ADD

@Module({
  imports: [
    ConfigModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const redis = configService.get('redis');

        return {
          connection: {
            host: redis.host,
            port: redis.port,
            password: redis.password || undefined,
            db: redis.db ?? 0,
          },
        };
      },
      inject: [ConfigService],
    }),

    // Existing inbound queue
    BullModule.registerQueue({
      name: 'process-message',
    }),

    // ✅ outbound queue (Phase 3)
    BullModule.registerQueue({
      name: 'send-message',
    }),
  ],
  providers: [
    InboundProducer,
    OutboundProducer, // ✅ ADD
  ],
  exports: [
    BullModule,
    InboundProducer,
    OutboundProducer, // ✅ ADD
  ],
})
export class QueuesModule {}
