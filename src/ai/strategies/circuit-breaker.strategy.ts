import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRedis } from '@nestjs-modules/ioredis';
import type { Redis } from 'ioredis';

import { LoggerService } from '../../observability/logger.service';

type CircuitState = 'closed' | 'open' | 'half-open';

@Injectable()
export class CircuitBreakerStrategy {
  private readonly failureThreshold: number;
  private readonly windowSeconds: number;
  private readonly openDurationSeconds: number;
  private readonly testIntervalSeconds: number;

  constructor(
    private readonly config: ConfigService,
    private readonly logger: LoggerService,
    @InjectRedis() private readonly redis: Redis,
  ) {
    this.failureThreshold = Number(
      this.config.get<number>('ai.circuitBreaker.failureThreshold') ?? 0.5,
    );
    this.windowSeconds = Number(
      this.config.get<number>('ai.circuitBreaker.windowSeconds') ?? 60,
    );
    this.openDurationSeconds = Number(
      this.config.get<number>('ai.circuitBreaker.openDurationSeconds') ?? 300,
    );
    this.testIntervalSeconds = Number(
      this.config.get<number>('ai.circuitBreaker.testIntervalSeconds') ?? 30,
    );

    this.logger.log(
      JSON.stringify({
        event: 'circuit_breaker_initialized',
        failureThreshold: this.failureThreshold,
        windowSeconds: this.windowSeconds,
        openDurationSeconds: this.openDurationSeconds,
        testIntervalSeconds: this.testIntervalSeconds,
      }),
      'CircuitBreakerStrategy',
    );
  }

  private stateKey(tenantSlug: string) {
    return `circuit:${tenantSlug}:openai:state`;
  }
  private openedAtKey(tenantSlug: string) {
    return `circuit:${tenantSlug}:openai:opened_at`;
  }
  private statsKey(tenantSlug: string) {
    return `circuit:${tenantSlug}:openai:stats`;
  }
  private lastTestKey(tenantSlug: string) {
    return `circuit:${tenantSlug}:openai:last_test`;
  }

  async getState(tenantSlug: string): Promise<CircuitState> {
    const state = (await this.redis.get(this.stateKey(tenantSlug))) as CircuitState | null;
    if (!state) return 'closed';

    if (state === 'open') {
      const openedAt = Number((await this.redis.get(this.openedAtKey(tenantSlug))) ?? 0);
      const elapsed = Math.floor((Date.now() - openedAt) / 1000);

      if (openedAt > 0 && elapsed >= this.openDurationSeconds) {
        await this.redis.set(this.stateKey(tenantSlug), 'half-open');

        this.logger.log(
          JSON.stringify({
            event: 'circuit_transitioned_to_half_open',
            tenantSlug,
            elapsedSeconds: elapsed,
          }),
          'CircuitBreakerStrategy',
        );

        return 'half-open';
      }
    }

    return state;
  }

  async shouldUseOpenAi(tenantSlug: string): Promise<boolean> {
    const state = await this.getState(tenantSlug);

    if (state === 'closed') return true;
    if (state === 'open') return false;

    // half-open: test periodically
    const last = Number((await this.redis.get(this.lastTestKey(tenantSlug))) ?? 0);
    const now = Date.now();

    if (now - last >= this.testIntervalSeconds * 1000) {
      await this.redis.set(this.lastTestKey(tenantSlug), String(now));

      this.logger.log(
        JSON.stringify({
          event: 'circuit_testing_openai',
          tenantSlug,
          state: 'half-open',
        }),
        'CircuitBreakerStrategy',
      );

      return true;
    }

    return false;
  }

  async recordSuccess(tenantSlug: string): Promise<void> {
    // ✅ ADD: keep an explicit "closed" state key for visibility while healthy
    // This ensures redis-cli GET circuit:<tenant>:openai:state shows "closed"
    await this.redis.set(this.stateKey(tenantSlug), 'closed');
    await this.redis.expire(this.stateKey(tenantSlug), this.openDurationSeconds + 60);

    await this.addStat(tenantSlug, 1);

    const state = await this.getState(tenantSlug);
    if (state === 'half-open') {
      await this.redis.set(this.stateKey(tenantSlug), 'closed');
      await this.redis.del(this.openedAtKey(tenantSlug));
      await this.redis.del(this.statsKey(tenantSlug));

      this.logger.log(
        JSON.stringify({ event: 'circuit_closed_after_success', tenantSlug }),
        'CircuitBreakerStrategy',
      );
    }
  }

  async recordFailure(tenantSlug: string): Promise<void> {
    await this.addStat(tenantSlug, 0);
    await this.evaluateAndMaybeOpen(tenantSlug);
  }

  private async addStat(tenantSlug: string, ok: 0 | 1): Promise<void> {
    const key = this.statsKey(tenantSlug);
    await this.redis.lpush(key, String(ok));
    await this.redis.ltrim(key, 0, 99);
    await this.redis.expire(key, this.windowSeconds);

    this.logger.debug(
      JSON.stringify({
        event: 'circuit_stat_added',
        tenantSlug,
        stat: ok === 1 ? 'success' : 'failure',
      }),
      'CircuitBreakerStrategy',
    );
  }

  private async evaluateAndMaybeOpen(tenantSlug: string): Promise<void> {
    const values = await this.redis.lrange(this.statsKey(tenantSlug), 0, -1);
    if (values.length < 4) return;

    const failures = values.filter((v) => v === '0').length;
    const rate = failures / values.length;

    this.logger.log(
      JSON.stringify({
        event: 'circuit_evaluation',
        tenantSlug,
        total: values.length,
        failures,
        failureRate: rate,
        threshold: this.failureThreshold,
      }),
      'CircuitBreakerStrategy',
    );

    if (rate >= this.failureThreshold) {
      await this.redis.set(this.stateKey(tenantSlug), 'open');
      await this.redis.set(this.openedAtKey(tenantSlug), String(Date.now()));
      await this.redis.expire(this.stateKey(tenantSlug), this.openDurationSeconds + 60);
      await this.redis.expire(this.openedAtKey(tenantSlug), this.openDurationSeconds + 60);

      this.logger.warn(
        JSON.stringify({
          event: 'circuit_opened',
          tenantSlug,
          failureRate: rate,
          threshold: this.failureThreshold,
          openDurationSeconds: this.openDurationSeconds,
        }),
        'CircuitBreakerStrategy',
      );
    }
  }
}
