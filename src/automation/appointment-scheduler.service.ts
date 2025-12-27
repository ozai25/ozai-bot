import { Injectable } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { LoggerService } from '../observability/logger.service';
import { Conversation } from '../database/entities/tenant/conversation.entity';

@Injectable()
export class AppointmentSchedulerService {
  constructor(
    private readonly ai: AiService,
    private readonly logger: LoggerService,
  ) {}

  async handleAppointmentRequest(
    conversation: Conversation,
    userMessage: string,
    tenantSlug: string,
  ): Promise<string> {
    try {
      const extractionPrompt = `Extract appointment details from: "${userMessage}". JSON format: { "date": "...", "time": "...", "service": "..." }`;

      const aiResult = await this.ai.generateResponse({
        tenantSlug,
        userText: extractionPrompt,
      });

      if (!aiResult?.ok) throw new Error('Failed to extract appointment details');

      const slots = await this.getMockAvailableSlots();

      const proposalPrompt = `The user wants an appointment. Available slots are: ${slots.join(
        ', ',
      )}. Write a polite message offering these slots.`;

      const proposalResult = await this.ai.generateResponse({
        tenantSlug,
        userText: proposalPrompt,
      });

      // >>> ADD START: narrow AiResult before accessing .text >>>
      if (!proposalResult?.ok) throw new Error('Failed to generate appointment proposal');
      // <<< ADD END <<<

      return proposalResult.text;
    } catch (error: any) {
      this.logger.error(
        JSON.stringify({
          event: 'appointment_scheduling_error',
          conversationId: conversation?.id,
          tenantSlug,
          error: error?.message,
        }),
        '',
        'AppointmentSchedulerService',
      );

      return "I'm having trouble accessing the calendar right now. Can you please tell me your preferred date and time again?";
    }
  }

  // >>> GRANDMASTER INJECTION: expose slots for deterministic confirmation state >>>
  // This is additive and does NOT change existing behavior.
  async getAvailableSlotsForTenant(tenantSlug: string): Promise<string[]> {
    void tenantSlug; // reserved for future per-tenant calendar logic
    return this.getMockAvailableSlots();
  }
  // <<< END INJECTION <<<

  private async getMockAvailableSlots(): Promise<string[]> {
    return ['Friday at 9:00 AM', 'Friday at 2:00 PM', 'Saturday at 10:00 AM'];
  }
}
