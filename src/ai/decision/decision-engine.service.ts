import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { LoggerService } from '../../observability/logger.service';
import { AiDecisionOutput } from '../contracts/ai-decision-output';
import { AI_DECISION_ADAPTER } from './ai-decision-adapter';
import type { AiDecisionAdapter, AiDecisionAdapterInput } from './ai-decision-adapter';


export type DecisionResult = {
  reply?: {
    platform: 'facebook' | 'instagram' | 'whatsapp';
    recipientId: string;
    text: string;
  };
  escalate?: {
    tenantSlug: string;
    platform: string;
    conversationId?: string;
    userIdentifier?: string;
    userText?: string;
    intent?: string;
    leadScore?: { score?: number; classification?: string };
    appointment?: { confirmedSlot?: string };
    quote?: { urgency?: string; price?: number; serviceType?: string };
  };
};

@Injectable()
export class DecisionEngineService {
  constructor(
    private readonly config: ConfigService,
    private readonly logger: LoggerService,

    // Optional AI adapter (default is no-op). Rules still run even if AI returns null.
    @Inject(AI_DECISION_ADAPTER)
    private readonly ai: AiDecisionAdapter,
  ) {}

  async decide(input: {
    tenantSlug: string;
    platform: 'facebook' | 'instagram' | 'whatsapp' | string;
    conversationId?: string;
    userIdentifier?: string;
    userText?: string;

    // reply routing (outbound)
    recipientId?: string;
  }): Promise<DecisionResult> {
    const tenantSlug = String(input.tenantSlug || '').trim();
    const platform = String(input.platform || '').trim().toLowerCase();
    const userText = String(input.userText || '').trim();

    if (!tenantSlug) return {};
    if (!userText) return {};

    const replyEnabled = this.toBool(
      this.getTenantCfg(tenantSlug, 'AI_REPLY_ENABLED', 'true'),
    );
    const escalationEnabled = this.toBool(
      this.getTenantCfg(tenantSlug, 'ESCALATION_ENABLED', 'true'),
    );

    // 1) AI (optional)
    let aiOut: AiDecisionOutput | null = null;
    try {
      const aiInput: AiDecisionAdapterInput = {
        tenantSlug,
        platform,
        userText,
        conversationId: input.conversationId,
        userIdentifier: input.userIdentifier,
      };
      aiOut = await this.ai.decide(aiInput);
    } catch (e: any) {
      this.logger.warn(
        JSON.stringify({
          event: 'decision_engine_ai_adapter_error',
          tenantSlug,
          platform,
          error: e?.message ?? 'unknown_error',
        }),
        'DecisionEngineService',
      );
    }

    // 2) Merge + Rules
    const intent = String(aiOut?.intent || this.ruleIntent(userText) || '').trim();
    const leadScore = aiOut?.leadScore ?? this.ruleLeadScore(intent);
    const quote = aiOut?.quote ?? this.ruleQuote(userText);
    const appointment = aiOut?.appointment;

    // Escalation signals
    const shouldEscalate = escalationEnabled && this.shouldEscalate({
      tenantSlug,
      intent,
      leadScore,
      quote,
      appointment,
    });

    // Reply text (rules fallback)
    const suggestedReply =
      String(aiOut?.suggestedReply || '').trim() ||
      this.getTenantCfg(
        tenantSlug,
        'AUTO_REPLY_FALLBACK_MESSAGE',
        'Thanks for the message — one moment.',
      );

    const result: DecisionResult = {};

    if (shouldEscalate) {
      result.escalate = {
        tenantSlug,
        platform,
        conversationId: input.conversationId,
        userIdentifier: input.userIdentifier,
        userText,
        intent: intent || undefined,
        leadScore: leadScore || undefined,
        appointment: appointment || undefined,
        quote: quote || undefined,
      };
    }

    // Only reply if enabled and we have routing info
    const recipientId = String(input.recipientId || '').trim();
    if (replyEnabled && recipientId && this.isOutboundPlatform(platform)) {
      result.reply = {
        platform,
        recipientId,
        text: suggestedReply,
      };
    }

    this.logger.log(
      JSON.stringify({
        event: 'decision_engine_decision_made',
        tenantSlug,
        platform,
        hasAi: Boolean(aiOut),
        intent,
        leadScore,
        quote,
        replyEnabled,
        escalationEnabled,
        willReply: Boolean(result.reply),
        willEscalate: Boolean(result.escalate),
      }),
      'DecisionEngineService',
    );

    return result;
  }

  // ======================
  // RULES (deterministic)
  // ======================

  private ruleIntent(userText: string): string | null {
    const t = userText.toLowerCase();

    if (t.includes('stop') || t.includes('unsubscribe') || t.includes('opt out') || t.includes('opt-out')) {
      return 'opt_out';
    }
    if (t.includes('human') || t.includes('agent') || t.includes('representative') || t.includes('call me')) {
      return 'human_handoff';
    }
    if (t.includes('emergency') || t.includes('asap') || t.includes('right now')) {
      return 'quote_emergency';
    }
    if (t.includes('today') || t.includes('same day') || t.includes('same-day')) {
      return 'quote_same_day';
    }
    return null;
  }

  private ruleLeadScore(intent: string): { score?: number; classification?: string } | undefined {
    const i = (intent || '').toLowerCase();
    if (!i) return undefined;

    if (i.includes('human') || i.includes('handoff')) return { score: 95, classification: 'hot' };
    if (i.includes('quote_emergency')) return { score: 96, classification: 'hot' };
    if (i.includes('quote_same_day')) return { score: 92, classification: 'hot' };
    if (i.includes('opt_out')) return { score: 0, classification: 'cold' };

    return undefined;
  }

  private ruleQuote(userText: string): { urgency?: string } | undefined {
    const t = userText.toLowerCase();
    if (t.includes('emergency') || t.includes('asap') || t.includes('right now')) return { urgency: 'emergency' };
    if (t.includes('today') || t.includes('same day') || t.includes('same-day')) return { urgency: 'same-day' };
    return undefined;
  }

  private shouldEscalate(input: {
    tenantSlug: string;
    intent?: string;
    leadScore?: { score?: number; classification?: string };
    quote?: { urgency?: string };
    appointment?: { confirmedSlot?: string };
  }): boolean {
    const intent = String(input.intent || '').toLowerCase();
    const leadClass = String(input.leadScore?.classification || '').toLowerCase();
    const score = Number(input.leadScore?.score ?? -1);

    const DEFAULT = 90;
    const tenantKey = `${input.tenantSlug.toUpperCase()}_ESCALATION_HOT_SCORE_THRESHOLD`;
    const raw = String(this.config.get<string>(tenantKey, '') || '').trim();
    const configured = raw ? Number(raw) : NaN;

    // safe: never allow threshold > 90 while older logic elsewhere might assume 90
    const threshold = !Number.isNaN(configured) && configured > 0 ? Math.min(DEFAULT, Math.floor(configured)) : DEFAULT;

    const urgency = String(input.quote?.urgency || '').toLowerCase();
    const appointmentConfirmed = Boolean(input.appointment?.confirmedSlot);

    if (intent.includes('opt_out')) return true;
    if (intent.includes('human') || intent.includes('handoff') || intent.includes('agent')) return true;

    if (urgency === 'emergency') return true;
    if (appointmentConfirmed) return true;

    if (leadClass === 'hot') return true;
    if (score >= threshold) return true;

    return false;
  }

  // ======================
  // Helpers
  // ======================

  private isOutboundPlatform(p: string): p is 'facebook' | 'instagram' | 'whatsapp' {
    return p === 'facebook' || p === 'instagram' || p === 'whatsapp';
  }

  private getTenantCfg(tenantSlug: string, suffix: string, fallback: string): string {
    const key = `${String(tenantSlug).toUpperCase()}_${suffix}`;
    const v = this.config.get<string>(key);
    return (v == null || String(v).trim() === '') ? fallback : String(v);
  }

  private toBool(v: string): boolean {
    const x = String(v ?? '').trim().toLowerCase();
    return x === '1' || x === 'true' || x === 'yes' || x === 'on';
  }
}
