import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

// ✅ ADD
import { TypeOrmModule } from '@nestjs/typeorm';

// ✅ ADD (side-effect import: adds redactObject() compat)
import '../security/pii-redactor.compat';

import { LoggerService } from './logger.service';

// ✅ Existing (you had this earlier)
import { TelegramAdminAlertService } from '../alerts/telegram-admin-alert.service';

// ✅ ADD
import { SecurityModule } from '../security/security.module';

// ✅ ADD
import { AuditLogService } from './audit-log.service';
import { AuditInterceptor } from './audit.interceptor';

// ✅ ADD
import { AuditLog } from '../database/entities/core/audit-log.entity';

// ✅ ADD (Phase 6 – Dashboard)
import { BullModule } from '@nestjs/bullmq';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { AiModule } from '../ai/ai.module';

@Global()
@Module({
  imports: [
    ConfigModule,

    // ✅ ADD: provides PiiRedactorService
    SecurityModule,

    // ✅ ADD: registers AuditLog repository for AuditLogService DI
    TypeOrmModule.forFeature([AuditLog]),

    // ✅ ADD (Phase 6 – Dashboard needs circuit breaker provider + queue access)
    AiModule,
    BullModule.registerQueue(
      { name: 'process-message' },
      { name: 'send-message' },
    ),
  ],
  controllers: [
    // ✅ ADD (Phase 6 – Dashboard)
    DashboardController,
  ],
  providers: [
    LoggerService,
    TelegramAdminAlertService,

    // ✅ ADD
    AuditLogService,
    AuditInterceptor,

    // ✅ ADD (Phase 6 – Dashboard)
    DashboardService,
  ],
  exports: [
    LoggerService,
    TelegramAdminAlertService,

    // ✅ ADD
    AuditLogService,
    AuditInterceptor,

    // ✅ ADD (Phase 6 – Dashboard)
    DashboardService,

    // ✅ ADD (optional, helps if another module needs AuditLog repo later)
    TypeOrmModule,
  ],
})
export class ObservabilityModule {}
