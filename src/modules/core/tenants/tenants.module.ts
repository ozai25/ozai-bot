import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisModule } from '@nestjs-modules/ioredis';

import { Tenant } from '../../../database/entities/core/tenant.entity';
import { TenantsService } from './tenants.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant]),
    RedisModule, // <-- ensures InjectRedis() is available in this module context
  ],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
