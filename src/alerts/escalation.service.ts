import { Injectable } from '@nestjs/common';

// ✅ ADD
import { ConfigService } from '@nestjs/config';

import { LoggerService } from '../observability/logger.service';
import { TelegramAdminAlertService } from './telegram-admin-alert.service';

export type EscalationReason =
  | 'HOT_LEAD'
  | 'HUMAN_HANDOFF'
  | 'OPT_OUT'
  | 'APPOINTMENT_CONFIRMED'
  | 'QUOTE_EMERGENCY'
  | 'QUOTE_SAME_DAY';

@Injectable()
export class EscalationService {
  constructor(
    private readonly logger: LoggerService,
    private readonly telegram: TelegramAdminAlertService,

    // ✅ ADD
    private readonly config: ConfigService,
  ) {}

  async maybeEscalate(input: {
    tenantSlug: string;
    platform: 'facebook' | 'instagram' | 'whatsapp' | string;
    conversationId?: string;
    userIdentifier?: string;
    userText?: string;

    // signals
    intent?: string;
    leadScore?: { score?: number; classification?: string };
    appointment?: { confirmedSlot?: string };
    quote?: { urgency?: string; price?: number; serviceType?: string };
  }): Promise<void> {
    const tenantSlug = input.tenantSlug;
    if (!tenantSlug) return;

    const reasons = this.computeReasons(input);

    if (reasons.length === 0) {
      return;
    }

    const title = `ADMIN ESCALATION: ${reasons.join(' + ')}`;

    const lines: string[] = [
      `Platform: ${String(input.platform)}`,
      input.conversationId ? `ConversationId: ${input.conversationId}` : 'ConversationId: (none)',
      input.userIdentifier ? `User: ${input.userIdentifier}` : 'User: (none)',
      input.intent ? `Intent: ${input.intent}` : 'Intent: (none)',
      input.leadScore?.score != null ? `LeadScore: ${input.leadScore.score}` : 'LeadScore: (none)',
      input.leadScore?.classification ? `LeadClass: ${input.leadScore.classification}` : 'LeadClass: (none)',
      input.quote?.urgency ? `QuoteUrgency: ${input.quote.urgency}` : '',
      input.quote?.price != null ? `QuotePrice: ${input.quote.price}` : '',
      input.quote?.serviceType ? `QuoteService: ${input.quote.serviceType}` : '',
      input.appointment?.confirmedSlot ? `AppointmentSlot: ${input.appointment.confirmedSlot}` : '',
      input.userText ? `UserText: ${input.userText}` : 'UserText: (none)',
    ].filter(Boolean);

    const severity = reasons.includes('HUMAN_HANDOFF') || reasons.includes('OPT_OUT') || reasons.includes('QUOTE_EMERGENCY')
      ? 'critical'
      : reasons.includes('HOT_LEAD') || reasons.includes('APPOINTMENT_CONFIRMED')
      ? 'warn'
      : 'info';

    this.logger.log(
      JSON.stringify({
        event: 'admin_escalation_triggered',
        tenantSlug,
        reasons,
        platform: input.platform,
        conversationId: input.conversationId,
        userIdentifier: input.userIdentifier,
        severity,
      }),
      'EscalationService',
    );

    await this.telegram.sendAdminAlert({
      tenantSlug,
      title,
      lines,
      severity,
    });
  }

  private computeReasons(input: {
    intent?: string;
    leadScore?: { score?: number; classification?: string };
    appointment?: { confirmedSlot?: string };
    quote?: { urgency?: string };
  }): EscalationReason[] {
    const reasons: EscalationReason[] = [];

    const intent = (input.intent || '').toLowerCase();
    const leadClass = (input.leadScore?.classification || '').toLowerCase();
    const leadScore = Number(input.leadScore?.score ?? -1);

    // ✅ ADD: tenant-aware threshold (A=oz01-only) — additive only.
    // IMPORTANT: We intentionally cap threshold at 90 so your existing `>= 90` behavior remains valid.
    const tenantSlug = String((input as any)?.tenantSlug ?? '').trim();
    const hotThreshold = this.resolveHotLeadThreshold(tenantSlug);

    // ✅ ADD: earlier escalation when threshold is lower than 90 (no false-positives above 90)
    if (leadClass === 'hot' || leadScore >= hotThreshold) reasons.push('HOT_LEAD');

    if (leadClass === 'hot' || leadScore >= 90) reasons.push('HOT_LEAD');

    if (intent.includes('human') || intent.includes('handoff') || intent.includes('agent')) reasons.push('HUMAN_HANDOFF');
    if (intent.includes('opt_out') || intent.includes('unsubscribe') || intent === 'opt-out' || intent === 'optout') reasons.push('OPT_OUT');

    if (input.appointment?.confirmedSlot) reasons.push('APPOINTMENT_CONFIRMED');

    const urgency = (input.quote?.urgency || '').toLowerCase();
    if (urgency === 'emergency') reasons.push('QUOTE_EMERGENCY');
    if (urgency === 'same-day' || urgency === 'same_day') reasons.push('QUOTE_SAME_DAY');

    // de-dupe
    return Array.from(new Set(reasons));
  }

  // ✅ ADD: threshold resolver (A=oz01-only) — additive + safe
  private resolveHotLeadThreshold(tenantSlug: string): number {
    const DEFAULT = 90;

    const prefix = String(tenantSlug || '').toUpperCase();
    const tenantKey = prefix ? `${prefix}_ESCALATION_HOT_SCORE_THRESHOLD` : '';
    const globalKey = 'ESCALATION_HOT_LEAD_SCORE_THRESHOLD';

    const tenantRaw = tenantKey ? String(this.config.get<string>(tenantKey, '') || '').trim() : '';
    const globalRaw = String(this.config.get<string>(globalKey, '') || '').trim();

    const tenantVal = tenantRaw ? Number(tenantRaw) : NaN;
    const globalVal = globalRaw ? Number(globalRaw) : NaN;

    // Choose tenant override if valid, else global, else default
    const chosen =
      !Number.isNaN(tenantVal) && tenantVal > 0
        ? tenantVal
        : !Number.isNaN(globalVal) && globalVal > 0
          ? globalVal
          : DEFAULT;

    // ✅ SAFETY: only allow stricter (lower/equal) threshold in this additive patch.
    // This prevents false positives if someone sets threshold > 90 while the legacy `>= 90` line still exists.
    return Math.min(DEFAULT, Math.max(1, Math.floor(chosen)));
  }
}
