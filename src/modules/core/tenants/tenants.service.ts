import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { Tenant } from '../../../database/entities/core/tenant.entity';
import { LoggerService } from '../../../observability/logger.service';

@Injectable()
export class TenantsService {
  private readonly CACHE_TTL = 3600; // 1 hour
  private readonly CACHE_PREFIX = 'tenant:';

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantsRepo: Repository<Tenant>,
    @InjectRedis()
    private readonly redis: Redis,
    private readonly logger: LoggerService,
  ) {}

  async findAll(): Promise<Tenant[]> {
    return this.tenantsRepo.find({
      where: { isActive: true },
      order: { slug: 'ASC' },
    });
  }

  async findBySlug(slug: string): Promise<Tenant | null> {
    const cacheKey = `${this.CACHE_PREFIX}${slug}`;

    try {
      // Try cache first
      const cached = await this.redis.get(cacheKey);

      if (cached) {
        this.logger.debug(`Tenant cache hit: ${slug}`, 'TenantsService');
        return JSON.parse(cached) as Tenant;
      }

      // Cache miss: query database
      this.logger.debug(
        `Tenant cache miss: ${slug}, querying database`,
        'TenantsService',
      );

      const tenant = await this.tenantsRepo.findOne({
        where: { slug },
      });

      if (tenant) {
        // Cache for future requests
        await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(tenant));

        this.logger.debug(`Tenant cached: ${slug}`, 'TenantsService');
      }

      return tenant;
    } catch (error: any) {
      this.logger.error(
        `Error fetching tenant ${slug}: ${error.message}`,
        error.stack,
        'TenantsService',
      );

      // If Redis fails, still return database result
      return this.tenantsRepo.findOne({ where: { slug } });
    }
  }

  async invalidateCache(slug: string): Promise<void> {
    const cacheKey = `${this.CACHE_PREFIX}${slug}`;
    await this.redis.del(cacheKey);

    this.logger.log(`Tenant cache invalidated: ${slug}`, 'TenantsService');
  }

  async seedDefaults(): Promise<void> {
    const defaults: Array<Partial<Tenant>> = [
      {
        slug: 'sg01',
        name: 'Shine & Go Cleaning',
        schemaName: 'sg01',
        config: {
          languagePolicy: 'bilingual',
          primaryLanguage: 'en',
          secondaryLanguage: 'es',
          assistantId: process.env.SG01_ASSISTANT_ID || 'asst_placeholder',
          fallbackMessage:
            'Thank you for contacting Shine & Go Cleaning. Our team will respond shortly.',
        },
        apiKeys: {
          whatsapp: {
            phoneNumberId: process.env.SG01_WA_PHONE_NUMBER_ID,
            accessToken: process.env.SG01_WA_ACCESS_TOKEN,
            verifyToken: process.env.SG01_WA_VERIFY_TOKEN,
            appSecret: process.env.SG01_WA_APP_SECRET,
          },
        },
      },
      {
        slug: 'fp02',
        name: 'Furniture Plus',
        schemaName: 'fp02',
        config: {
          languagePolicy: 'spanish-only',
          primaryLanguage: 'es',
          salesAssistantId:
            process.env.FP02_SALES_ASSISTANT_ID || 'asst_placeholder',
          repairAssistantId:
            process.env.FP02_REPAIR_ASSISTANT_ID || 'asst_placeholder',
          fallbackMessage:
            'Gracias por contactar Furniture Plus. Nuestro equipo responderá pronto.',
        },
        apiKeys: {
          whatsapp: {
            phoneNumberId: process.env.FP02_WA_PHONE_NUMBER_ID,
            accessToken: process.env.FP02_WA_ACCESS_TOKEN,
            verifyToken: process.env.FP02_WA_VERIFY_TOKEN,
            appSecret: process.env.FP02_WA_APP_SECRET,
          },
        },
      },

      // >>> ADD START: OZ01 personal tenant (ADD ONLY) >>>
      {
        slug: 'oz01',
        name: 'Dimitri Personal',
        schemaName: 'oz01',
        config: {
          languagePolicy: 'bilingual',
          primaryLanguage: 'en',
          secondaryLanguage: 'es',
          fallbackMessage:
            'Thanks for messaging Dimitri. One moment while I respond.',
        },
        apiKeys: {
          facebook: {
            pageAccessToken: process.env.OZ01_FB_PAGE_ACCESS_TOKEN,
            verifyToken: process.env.OZ01_FB_VERIFY_TOKEN,
            appSecret: process.env.OZ01_FB_APP_SECRET,
          },
          instagram: {
            pageAccessToken: process.env.OZ01_IG_PAGE_ACCESS_TOKEN,
            verifyToken: process.env.OZ01_IG_VERIFY_TOKEN,
            appSecret: process.env.OZ01_IG_APP_SECRET,
          },
          whatsapp: {
            phoneNumberId: process.env.OZ01_WA_PHONE_NUMBER_ID,
            accessToken: process.env.OZ01_WA_ACCESS_TOKEN,
            verifyToken: process.env.OZ01_WA_VERIFY_TOKEN,
            appSecret: process.env.OZ01_WA_APP_SECRET,
          },
          telegram: {
            botToken: process.env.OZ01_TG_BOT_TOKEN,
            chatId: process.env.OZ01_TG_CHAT_ID,
          },
        },
      },
      // <<< ADD END <<<
    ];

    for (const def of defaults) {
      const existing = await this.tenantsRepo.findOne({
        where: { slug: def.slug as string },
      });

      if (!existing) {
        const tenant = await this.tenantsRepo.save(
          this.tenantsRepo.create(def),
        );

        this.logger.log(`Seeded tenant: ${tenant.slug}`, 'TenantsService');
      } else {
        this.logger.debug(`Tenant already exists: ${def.slug}`, 'TenantsService');
      }
    }
  }
}
