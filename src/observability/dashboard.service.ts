import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { CircuitBreakerStrategy } from '../ai/strategies/circuit-breaker.strategy';

@Injectable()
export class DashboardService {
  constructor(
    @InjectQueue('process-message') private readonly inboundQueue: Queue,
    @InjectQueue('send-message') private readonly outboundQueue: Queue,
    @InjectRedis() private readonly redis: Redis,
    private readonly circuitBreaker: CircuitBreakerStrategy,
  ) {}

  async getSystemSnapshot() {
    // 1. Get Queue Health
    const inboundCounts = await this.inboundQueue.getJobCounts();
    const outboundCounts = await this.outboundQueue.getJobCounts();

    // 2. Get AI Circuit Status
    const sg01State = await this.circuitBreaker.getState('sg01');
    const fp02State = await this.circuitBreaker.getState('fp02');
    const oz01State = await this.circuitBreaker.getState('oz01');

    // 3. Get Redis Health
    const memoryUsage = await this.redis.info('memory');
    const usedMemory = memoryUsage.match(/used_memory_human:(\w+\.\w+)/)?.[1] || 'Unknown';

    return {
      status: 'OPERATIONAL',
      timestamp: new Date().toISOString(),
      infrastructure: {
        redis_memory: usedMemory,
        uptime: process.uptime(),
      },
      queues: {
        inbound: {
          waiting: inboundCounts.waiting,
          active: inboundCounts.active,
          failed: inboundCounts.failed,
          status: inboundCounts.waiting > 100 ? 'WARNING' : 'HEALTHY',
        },
        outbound: {
          waiting: outboundCounts.waiting,
          active: outboundCounts.active,
          failed: outboundCounts.failed,
          status: outboundCounts.waiting > 50 ? 'WARNING' : 'HEALTHY',
        },
      },
      ai_circuits: {
        sg01: { state: sg01State, is_alive: sg01State === 'closed' },
        fp02: { state: fp02State, is_alive: fp02State === 'closed' },
        oz01: { state: oz01State, is_alive: oz01State === 'closed' },
      },
    };
  }
}
