import { Injectable } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { LoggerService } from '../observability/logger.service';

export interface QuoteParameters {
  serviceType: string;
  squareFootage?: number;
  urgency: 'standard' | 'same-day' | 'emergency';
}

export interface PricingRules {
  basePrice: Record<string, number>;
  pricePerSqFt: number;
  multipliers: Record<string, number>;
}

@Injectable()
export class QuoteGeneratorService {
  constructor(
    @InjectRedis() private readonly redis: Redis,
    private readonly logger: LoggerService,
  ) {}

  async generateQuote(params: QuoteParameters, tenantSlug: string): Promise<number> {
    const rules = await this.getPricingRules(tenantSlug);

    if (!rules) throw new Error(`No pricing rules found for tenant ${tenantSlug}`);

    let price = rules.basePrice[params.serviceType] || 100;

    if (params.squareFootage) {
      price += (params.squareFootage / 100) * rules.pricePerSqFt;
    }

    if (params.urgency === 'same-day') price *= rules.multipliers['same-day'] || 1.5;
    if (params.urgency === 'emergency') price *= rules.multipliers['emergency'] || 2.0;

    this.logger.log(
      JSON.stringify({
        event: 'quote_generated',
        tenantSlug,
        serviceType: params.serviceType,
        urgency: params.urgency,
        price,
      }),
      'QuoteGeneratorService',
    );

    return Math.round(price);
  }

  private async getPricingRules(tenantSlug: string): Promise<PricingRules> {
    const cacheKey = `pricing_rules:${tenantSlug}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const rules: PricingRules = {
      basePrice: { house: 150, apartment: 100, 'deep-clean': 200 },
      pricePerSqFt: 5,
      multipliers: { 'same-day': 1.5, emergency: 2.0 },
    };

    await this.redis.setex(cacheKey, 3600, JSON.stringify(rules));
    return rules;
  }
}
