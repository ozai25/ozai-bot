import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { LoggerService } from '../observability/logger.service';

interface BusinessSchedule {
  timezone: string;
  schedule: Record<string, string>;
}

@Injectable()
export class BusinessHoursService {
  constructor(
    @InjectRedis() private readonly redis: Redis,
    private readonly logger: LoggerService,
  ) {}

  async isBusinessOpen(tenantSlug: string): Promise<boolean> {
    const config = await this.getScheduleConfig(tenantSlug);
    if (!config) return true;

    const now = DateTime.now().setZone(config.timezone);
    const dayOfWeek = now.toFormat('EEEE').toLowerCase();
    const hours = config.schedule[dayOfWeek];

    if (!hours || hours === 'closed') return false;

    const [openStr, closeStr] = hours.split('-');
    const openTime = DateTime.fromFormat(openStr, 'HH:mm', { zone: config.timezone });
    const closeTime = DateTime.fromFormat(closeStr, 'HH:mm', { zone: config.timezone });

    const nowTime = DateTime.fromFormat(now.toFormat('HH:mm'), 'HH:mm', { zone: config.timezone });

    return nowTime >= openTime && nowTime <= closeTime;
  }

  private async getScheduleConfig(tenantSlug: string): Promise<BusinessSchedule | null> {
    const cacheKey = `business_hours:${tenantSlug}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const config: BusinessSchedule = {
      timezone: 'America/Santo_Domingo',
      schedule: {
        monday: '09:00-18:00',
        tuesday: '09:00-18:00',
        wednesday: '09:00-18:00',
        thursday: '09:00-18:00',
        friday: '09:00-18:00',
        saturday: '09:00-13:00',
        sunday: 'closed',
      },
    };

    await this.redis.setex(cacheKey, 86400, JSON.stringify(config));
    return config;
  }
}
