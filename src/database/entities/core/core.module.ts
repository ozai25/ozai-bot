import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from './tenant.entity';
import { TenantsService } from '../../../modules/core/tenants/tenants.service';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant])],
  providers: [TenantsService],
  exports: [TenantsService], // ✅ CRITICAL: Export for use in other modules
})
export class CoreModule {}