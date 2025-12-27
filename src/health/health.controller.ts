import { Controller, Get } from '@nestjs/common';
import { 
  HealthCheck, 
  HealthCheckService, 
  TypeOrmHealthIndicator,
  MemoryHealthIndicator,
} from '@nestjs/terminus';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  @Get('liveness')
  @HealthCheck()
  checkLiveness() {
    return this.health.check([
      // Basic memory check
      () => this.memory.checkHeap('memory_heap', 300 * 1024 * 1024), // 300MB
    ]);
  }

  @Get('readiness')
  @HealthCheck()
  checkReadiness() {
    return this.health.check([
      // Database connection
      () => this.db.pingCheck('database', { timeout: 2000 }),
      
      // Redis connection
      async () => {
        try {
          await this.redis.ping();
          return {
            redis: {
              status: 'up',
            },
          };
        } catch (error) {
          return {
            redis: {
              status: 'down',
              message: error.message,
            },
          };
        }
      },
      
      // Memory check
      () => this.memory.checkHeap('memory_heap', 300 * 1024 * 1024),
    ]);
  }
}
