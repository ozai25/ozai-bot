// src/queues/queue.config.ts
import { ConfigService } from '@nestjs/config';
import type { BullRootModuleOptions } from '@nestjs/bullmq';

export function buildBullMqRootOptions(
  configService: ConfigService,
): BullRootModuleOptions {
  // This assumes you already have src/config/redis.config.ts loaded under key "redis"
  const redis = configService.get<any>('redis') ?? {};

  return {
    // BullMQ expects a connection object like ioredis
    connection: {
      host: redis.host ?? '127.0.0.1',
      port: redis.port ?? 6379,
      password: redis.password || undefined,
      db: redis.db ?? 0,
    },

    // Optional: keeps Bull keys organized
    prefix: redis.prefix ?? 'bull',

    // Safe defaults
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },

      // cleanup so Redis doesn’t grow forever
      removeOnComplete: { age: 60 * 60, count: 500 },
      removeOnFail: { age: 24 * 60 * 60, count: 1000 },
    },
  };
}
