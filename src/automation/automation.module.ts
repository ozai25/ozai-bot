import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ObservabilityModule } from '../observability/observability.module';
import { AiModule } from '../ai/ai.module';

import { AppointmentSchedulerService } from './appointment-scheduler.service';
import { QuoteGeneratorService } from './quote-generator.service';
import { BusinessHoursService } from './business-hours.service';

@Module({
  imports: [
    ConfigModule,
    ObservabilityModule,
    AiModule,
  ],
  providers: [
    AppointmentSchedulerService,
    QuoteGeneratorService,
    BusinessHoursService,
  ],
  exports: [
    AppointmentSchedulerService,
    QuoteGeneratorService,
    BusinessHoursService,
  ],
})
export class AutomationModule {}
