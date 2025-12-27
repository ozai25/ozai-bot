import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { RedisModule } from '@nestjs-modules/ioredis';
import { APP_GUARD } from '@nestjs/core';
import type { Redis } from 'ioredis';

import { ThrottlerRedisStorage } from './throttler-redis.storage';

// ✅ ADD
import { AdminThrottlerGuard } from './admin-throttler.guard';

// Default connection token used by @nestjs-modules/ioredis for the default Redis client
const DEFAULT_REDIS_CONNECTION_TOKEN = 'default_IORedisModuleConnectionToken';

@Global()
@Module({
  imports: [
    ConfigModule,
    RedisModule,
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule, RedisModule],
      inject: [ConfigService, DEFAULT_REDIS_CONNECTION_TOKEN],
      useFactory: async (config: ConfigService, redis: Redis) => {
        const storage = new ThrottlerRedisStorage(redis);

        // Default lane (applies globally via ThrottlerGuard)
        const defaultTtl = Number(config.get('RATE_LIMIT_TTL_SECONDS')) || 60;
        const defaultLimit = Number(config.get('RATE_LIMIT_MAX_REQUESTS')) || 120;

        // Admin lane values (enforced via AdminThrottlerGuard on admin controllers)
        const adminTtl = Number(config.get('RATE_LIMIT_ADMIN_TTL_SECONDS')) || 60;
        const adminLimit = Number(config.get('RATE_LIMIT_ADMIN_MAX_REQUESTS')) || 100;

        // eslint-disable-next-line no-console
        console.log(`[RATE LIMIT BOOT] default ttl=${defaultTtl} limit=${defaultLimit}`);
        // eslint-disable-next-line no-console
        console.log(`[RATE LIMIT BOOT] admin   ttl=${adminTtl} limit=${adminLimit}`);

        // ✅ ADD (CRITICAL CLARIFICATION):
        // The presence of the named "admin" throttler enables @Throttle({ admin: { ... } }) metadata.
        // Enforcement is still executed by the global ThrottlerGuard (APP_GUARD).
        // AdminThrottlerGuard remains a NO-OP compatibility placeholder only.
        // eslint-disable-next-line no-console
        console.log('[RATE LIMIT BOOT] enforcement=global ThrottlerGuard (APP_GUARD)');

        // ✅ ADD: quick sanity check — what process.env says at runtime (useful when .env/.env.local precedence is off)
        // eslint-disable-next-line no-console
        console.log(
          `[RATE LIMIT BOOT] env default ttl=${process.env.RATE_LIMIT_TTL_SECONDS} limit=${process.env.RATE_LIMIT_MAX_REQUESTS}`,
        );
        // eslint-disable-next-line no-console
        console.log(
          `[RATE LIMIT BOOT] env admin   ttl=${process.env.RATE_LIMIT_ADMIN_TTL_SECONDS} limit=${process.env.RATE_LIMIT_ADMIN_MAX_REQUESTS}`,
        );

        return {
          throttlers: [
            {
              name: 'default',
              ttl: defaultTtl,
              limit: defaultLimit,
            },
            // NOTE: We keep the admin throttler here for clarity/telemetry,
            // but enforcement is done by AdminThrottlerGuard.
            //
            // ✅ ADD: Correction — enforcement is executed by ThrottlerGuard (APP_GUARD).
            // The controller must declare @Throttle({ admin: { ttl, limit } }) to opt into this lane.
            {
              name: 'admin',
              ttl: adminTtl,
              limit: adminLimit,
            },
          ],
          storage,
        };
      },
    }),
  ],
  providers: [
    ThrottlerRedisStorage,

    // ✅ ADD: Admin-only guard (opt-in per controller)
    AdminThrottlerGuard,

    // ✅ Global throttling
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },

    // ✅ ADD (SAFETY NOTE):
    // Do NOT register AdminThrottlerGuard as a global guard.
    // It is intentionally NO-OP and exists only to prevent DI breakage if referenced.
  ],
  exports: [ThrottlerModule, AdminThrottlerGuard],
})
export class RateLimitModule {}
