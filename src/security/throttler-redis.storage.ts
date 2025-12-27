import { Injectable } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { InjectRedis } from '@nestjs-modules/ioredis';
import type { Redis } from 'ioredis';

type ThrottlerStorageRecordLike = {
  totalHits: number;
  timeToExpire: number; // milliseconds
  isBlocked: boolean;
  timeToBlockExpire: number; // milliseconds
};

@Injectable()
export class ThrottlerRedisStorage implements ThrottlerStorage {
  constructor(@InjectRedis() private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecordLike> {
    const redisKey = `throttle:${throttlerName}:${key}`;

    // Atomic increment
    const current = await this.redis.incr(redisKey);

    // Set TTL on first hit
    if (current === 1) {
      await this.redis.expire(redisKey, ttl);
    }

    // Remaining TTL for headers
    const ttlRemainingSeconds = await this.redis.ttl(redisKey);

    // NOTE: blockDuration is currently unused in this simple storage.
    // If you later enable explicit blocking windows, we will incorporate it here.

    return {
      totalHits: current,
      timeToExpire: ttlRemainingSeconds > 0 ? ttlRemainingSeconds * 1000 : 0,
      isBlocked: current > limit,
      timeToBlockExpire: 0,
    };
  }
}
