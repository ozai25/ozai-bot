import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import type { Redis } from 'ioredis';

import { AiService } from '../ai/ai.service';
import { CircuitBreakerStrategy } from '../ai/strategies/circuit-breaker.strategy';

@Controller('test')
export class TestController {
  constructor(
    private readonly ai: AiService,
    private readonly breaker: CircuitBreakerStrategy,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  // ✅ Add: Direct AI test (bypasses queues)
  @Post('ai-direct')
  async aiDirect(@Body() body: { tenantSlug?: string; message?: string }) {
    const tenantSlug = body.tenantSlug ?? process.env.DEFAULT_TENANT_SLUG ?? 'oz01';

    const message = body.message ?? 'Hello, I need a quote for cleaning';

    const result = await this.ai.generateResponse({
      tenantSlug,
      userText: message,
    });

    return {
      ok: true,
      tenantSlug,
      result,
      timestamp: new Date().toISOString(),
    };
  }

  // ✅ Add: Inspect circuit keys for a tenant
  @Get('circuit/:tenantSlug')
  async circuit(@Param('tenantSlug') tenantSlug: string) {
    const stateKey = `circuit:${tenantSlug}:openai:state`;
    const statsKey = `circuit:${tenantSlug}:openai:stats`;
    const openedAtKey = `circuit:${tenantSlug}:openai:opened_at`;

    const computedState = await this.breaker.getState(tenantSlug);
    const redisState = await this.redis.get(stateKey);
    const stats = await this.redis.lrange(statsKey, 0, -1);
    const openedAt = await this.redis.get(openedAtKey);

    return {
      tenantSlug,
      computedState,
      redis: {
        stateKey,
        redisState,
        statsKey,
        stats,
        openedAtKey,
        openedAt,
      },
    };
  }

  // ✅ Add: List ALL circuit keys
  @Get('redis-circuit-keys')
  async redisCircuitKeys() {
    const keys = await this.redis.keys('circuit:*');
    return { count: keys.length, keys };
  }
}
