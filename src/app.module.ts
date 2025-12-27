// src/app.module.ts
import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisModule } from '@nestjs-modules/ioredis';

import databaseConfig from './config/database.config';
import redisConfig from './config/redis.config';
import aiConfig from './config/ai.config';
import appConfig from './config/app.config';
import securityConfig from './config/security.config';

import { ObservabilityModule } from './observability/observability.module';
import { RequestContextMiddleware } from './observability/request-context.middleware';
import { HealthModule } from './health/health.module';
import { SecurityModule } from './security/security.module';
import { DatabaseModule } from './database/database.module';
import { QueuesModule } from './queues/queues.module';
import { ProcessorsModule } from './processors/processors.module';
import { TestModule } from './test/test.module';
import { WhatsAppModule } from './whatsapp/whatsapp.module';

import { Tenant } from './database/entities/core/tenant.entity';
import { AiModule } from './ai/ai.module';
import { AutomationModule } from './automation/automation.module';
import { ConversationsModule } from './conversations/conversations.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, redisConfig, aiConfig, appConfig, securityConfig],
      envFilePath: ['.env', '.env.local'],
    }),

    ObservabilityModule,

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const dbConfig: any = configService.get('database') ?? {};

        return {
          type: 'postgres',
          host: String(dbConfig.host ?? 'localhost'),
          port: Number.parseInt(String(dbConfig.port ?? 5432), 10),
          username: String(dbConfig.username ?? 'postgres'),
          password: String(dbConfig.password ?? ''), // ✅ HARD GUARD: always string
          database: String(dbConfig.database ?? 'postgres'),
          ssl: dbConfig.ssl ?? false,
          synchronize: Boolean(dbConfig.synchronize ?? false),
          logging: Boolean(dbConfig.logging ?? false),

          entities: [Tenant],
          autoLoadEntities: true,
        };
      },
      inject: [ConfigService],
    }),

    RedisModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redis: any = configService.get('redis');
        return {
          isGlobal: true,
          type: 'single',
          options: redis,
        };
      },
    }),

    HealthModule,
    SecurityModule,
    DatabaseModule,
    ConversationsModule,
    QueuesModule,
    ProcessorsModule,
    WhatsAppModule,
    AiModule,
    AutomationModule,
    TestModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
