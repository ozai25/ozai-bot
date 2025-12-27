import { Controller, Get } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

@Controller('test/throttle')
export class ThrottleTestController {
  @Get('ping')
  @Throttle({ default: { limit: 20, ttl: 60 } })
  ping() {
    return { ok: true, ts: new Date().toISOString() };
  }
}
