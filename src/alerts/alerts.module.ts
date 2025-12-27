import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ObservabilityModule } from '../observability/observability.module';

// ✅ ADD
import { SecurityModule } from '../security/security.module';

import { TelegramAdminAlertService } from './telegram-admin-alert.service';
import { EscalationService } from './escalation.service';

@Module({
  imports: [
    ConfigModule,
    ObservabilityModule,

    // ✅ ADD
    SecurityModule,
  ],
  providers: [
    // ✅ MUST be here so EscalationService can inject it
    TelegramAdminAlertService,
    EscalationService,
  ],
  exports: [
    TelegramAdminAlertService,
    EscalationService,
  ],
})
export class AlertsModule {}
