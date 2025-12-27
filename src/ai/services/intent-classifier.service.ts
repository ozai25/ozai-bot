import { Injectable } from '@nestjs/common';
import { AiService } from '../ai.service';
import { LoggerService } from '../../observability/logger.service';

export enum UserIntent {
  REQUEST_QUOTE = 'request_quote',
  ASK_AVAILABILITY = 'ask_availability',
  SCHEDULE_APPOINTMENT = 'schedule_appointment',
  COMPLAINT = 'complaint',
  GENERAL_INQUIRY = 'general_inquiry',
  HOT_LEAD = 'hot_lead',
  PRICE_SHOPPING = 'price_shopping',
  OPT_OUT = 'opt_out',
  HUMAN_HANDOFF = 'human_handoff',
  SPAM = 'spam',
  UNKNOWN = 'unknown',

  // ✅ ADD (aligns with original mission set)
  OFF_TOPIC = 'off_topic',
}

@Injectable()
export class IntentClassifierService {
  constructor(
    private readonly ai: AiService,
    private readonly logger: LoggerService,
  ) {}

  async classify(message: string, tenantSlug: string): Promise<UserIntent> {
    const text = (message || '').toLowerCase().trim();

    // ZERO-COST CHECKS
    if (text.match(/^(stop|cancel|unsubscribe|quit)$/i)) return UserIntent.OPT_OUT;
    if (text.match(/(human|agent|operator|support|persona)/i)) return UserIntent.HUMAN_HANDOFF;

    try {
      const prompt = `Classify the following message into one of these categories: ${Object.values(UserIntent).join(
        ', ',
      )}. Return only the category name. Message: "${message}"`;

      // ✅ ADD: enforce a stable tenantSlug for classification
      const effectiveTenant = (tenantSlug || '').trim() || 'system';

      const aiResult = await this.ai.generateResponse({
        tenantSlug: effectiveTenant,
        userText: prompt,

        // ✅ ADD: stabilizers (safe even if AiService ignores them)
        systemPrompt:
          'You are an intent classification system. Respond with ONLY the intent label (one token), nothing else.',
        maxTokens: 50,
      } as any);

      if (!aiResult?.ok) return UserIntent.UNKNOWN;

      const detectedRaw = String(aiResult.text || '').trim().toLowerCase();

      // ✅ ADD: accept exact enum VALUES (e.g. "general_inquiry")
      const detectedAsValue = detectedRaw as UserIntent;
      if (Object.values(UserIntent).includes(detectedAsValue)) return detectedAsValue;

      // ✅ ADD: accept enum KEY names (e.g. "GENERAL_INQUIRY")
      const detectedKey = detectedRaw.replace(/\s+/g, '_').toUpperCase();
      const byKey = (UserIntent as any)[detectedKey] as UserIntent | undefined;
      if (byKey && Object.values(UserIntent).includes(byKey)) return byKey;

      return UserIntent.GENERAL_INQUIRY;
    } catch (error: any) {
      this.logger.error(
        JSON.stringify({
          event: 'intent_classification_failed',
          tenantSlug,
          error: error?.message,
        }),
        '',
        'IntentClassifierService',
      );
      return UserIntent.GENERAL_INQUIRY;
    }
  }
}
