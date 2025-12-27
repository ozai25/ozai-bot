import { Injectable } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

import { LoggerService } from '../observability/logger.service';

import { WhatsAppAdapter } from '../whatsapp/whatsapp.adapter';
import { FacebookAdapter } from '../facebook/facebook.adapter';
import { InstagramAdapter } from '../instagram/instagram.adapter';

import { AiService } from '../ai/ai.service';

import { OutboundProducer } from '../queues/producers/outbound.producer';

import { IntentClassifierService, UserIntent } from '../ai/services/intent-classifier.service';
import { LeadScorerService } from '../ai/services/lead-scorer.service';

import { BusinessHoursService } from '../automation/business-hours.service';
import { QuoteGeneratorService } from '../automation/quote-generator.service';
import { AppointmentSchedulerService } from '../automation/appointment-scheduler.service';

import { ConversationRepository } from '../repositories/conversation.repository';

// ✅ ADD: Alerts escalation wiring
import { EscalationService } from '../alerts/escalation.service';

type SupportedPlatform = 'facebook' | 'instagram' | 'whatsapp';

@Processor('process-message')
@Injectable()
export class MessageProcessor extends WorkerHost {
  constructor(
    private readonly logger: LoggerService,
    private readonly whatsappAdapter: WhatsAppAdapter,
    private readonly facebookAdapter: FacebookAdapter,
    private readonly instagramAdapter: InstagramAdapter,
    private readonly ai: AiService,
    private readonly outbound: OutboundProducer,

    private readonly intents: IntentClassifierService,
    private readonly leadScorer: LeadScorerService,

    private readonly businessHours: BusinessHoursService,
    private readonly quotes: QuoteGeneratorService,
    private readonly appointments: AppointmentSchedulerService,

    private readonly conversations: ConversationRepository,

    // ✅ ADD
    private readonly escalation: EscalationService,
  ) {
    super();
  }

  async process(job: Job<any>): Promise<any> {
    const jobData = job.data ?? {};

    const tenantSlug: string = jobData?.tenantSlug;
    const platformRaw: string = jobData?.platform;

    // ✅ coerce BullMQ Buffer-like payload into usable JSON
    const payload = this.coercePayload(jobData?.payload);

    this.logger.log(
      JSON.stringify({
        event: 'process_message_job_received',
        jobId: String(job.id),
        queue: job.queueName,
        tenantSlug,
        platform: platformRaw,
        payloadType: typeof payload,
        receivedAt: new Date().toISOString(),
      }),
      'MessageProcessor',
    );

    // Normalize (Phase 1)
    let userText = '';
    let recipientId: string | undefined;
    let platformThreadId: string | undefined;

    const platform = this.asSupportedPlatform(platformRaw);

    if (platform === 'whatsapp') {
      const normalized = this.whatsappAdapter.normalizeInbound(payload, tenantSlug);

      userText = normalized?.text ?? '';
      recipientId = normalized?.senderPlatformId;
      platformThreadId = normalized?.platformThreadId;

      if (!userText || userText.trim().length === 0) {
        userText = this.extractTextFallback(platform, payload);
      }

      this.logger.log(
        JSON.stringify({
          event: 'whatsapp_normalized',
          jobId: String(job.id),
          tenantSlug: normalized?.tenantSlug ?? tenantSlug,
          platform: normalized?.platform ?? platform,
          messageType: normalized?.messageType,
          platformThreadId,
          senderPlatformId: recipientId,
          receivedAt: normalized?.receivedAt,
          userTextLen: userText?.length ?? 0,
        }),
        'MessageProcessor',
      );
    } else if (platform === 'facebook') {
      const normalized = this.facebookAdapter.normalizeInbound(payload, tenantSlug);

      userText = normalized?.text ?? '';
      recipientId = normalized?.senderPlatformId;
      platformThreadId = normalized?.platformThreadId;

      if (!userText || userText.trim().length === 0) {
        userText = this.extractTextFallback(platform, payload);
      }

      this.logger.log(
        JSON.stringify({
          event: 'facebook_normalized',
          jobId: String(job.id),
          tenantSlug: normalized?.tenantSlug ?? tenantSlug,
          platform: normalized?.platform ?? platform,
          messageType: normalized?.messageType,
          platformThreadId,
          senderPlatformId: recipientId,
          receivedAt: normalized?.receivedAt,
          userTextLen: userText?.length ?? 0,
        }),
        'MessageProcessor',
      );
    } else if (platform === 'instagram') {
      const normalized = this.instagramAdapter.normalizeInbound(payload, tenantSlug);

      userText = normalized?.text ?? '';
      recipientId = normalized?.senderPlatformId;
      platformThreadId = normalized?.platformThreadId;

      if (!userText || userText.trim().length === 0) {
        userText = this.extractTextFallback(platform, payload);
      }

      this.logger.log(
        JSON.stringify({
          event: 'instagram_normalized',
          jobId: String(job.id),
          tenantSlug: normalized?.tenantSlug ?? tenantSlug,
          platform: normalized?.platform ?? platform,
          messageType: normalized?.messageType,
          platformThreadId,
          senderPlatformId: recipientId,
          receivedAt: normalized?.receivedAt,
          userTextLen: userText?.length ?? 0,
        }),
        'MessageProcessor',
      );
    }

    // Validate
    if (!tenantSlug || !platform || !userText || userText.trim().length === 0) {
      this.logger.warn(
        JSON.stringify({
          event: 'message_skipped_missing_required_fields',
          jobId: String(job.id),
          tenantSlug,
          platform: platformRaw,
          hasTenantSlug: Boolean(tenantSlug),
          hasPlatform: Boolean(platform),
          userTextLen: userText?.length ?? 0,
        }),
        'MessageProcessor',
      );
      return { ok: true, skipped: true };
    }

    const text = userText.trim();

    // Ensure we have a thread id; if missing, fallback to recipientId (best-effort)
    const threadId = platformThreadId ?? recipientId ?? `unknown-${Date.now()}`;

    // 0) Conversation state
    const conv = await this.conversations.findOrCreate({
      tenantSlug,
      platform,
      platformThreadId: threadId,
      userIdentifier: recipientId ?? 'unknown',
    });

    const conversationId = conv.id;

    // Update last activity (best-effort)
    await this.conversations.updateLastActivity(tenantSlug, conversationId, new Date());

    // Reload for freshest metadata (best-effort)
    const current = await this.conversations.findById(tenantSlug, conversationId);
    const meta = (current?.metadata ?? {}) as Record<string, any>;

    // 1) Appointment confirmation state (deterministic)
    // If we previously offered slots, user can confirm by replying 1/2/3 or the exact slot text.
    const pendingAppt = meta?.appointment?.pending === true;
    const offeredSlots: string[] = Array.isArray(meta?.appointment?.offeredSlots)
      ? meta.appointment.offeredSlots
      : [];

    if (pendingAppt && offeredSlots.length > 0) {
      const confirmedSlot = this.pickConfirmedSlot(text, offeredSlots);

      if (confirmedSlot) {
        await this.conversations.mergeMetadataDeep(tenantSlug, conversationId, {
          appointment: {
            pending: false,
            confirmedSlot,
            confirmedAt: new Date().toISOString(),
          },
        });

        const reply = `Perfect — confirmed: ${confirmedSlot}. See you then ✅`;

        await this.outbound.enqueueOutbound({
          tenantSlug,
          platform,
          recipientId: recipientId ?? threadId,
          text: reply,
        });

        // ✅ ADD: escalate appointment confirmations
        await this.escalation.maybeEscalate({
          tenantSlug,
          platform,
          conversationId,
          userIdentifier: recipientId ?? threadId,
          userText: text,
          appointment: { confirmedSlot },
        });

        this.logger.log(
          JSON.stringify({
            event: 'appointment_confirmed',
            jobId: String(job.id),
            tenantSlug,
            platform,
            conversationId,
            confirmedSlot,
          }),
          'MessageProcessor',
        );

        return { ok: true, appointmentConfirmed: true };
      }
      // If pending but not confirmed, fall through to normal routing (so user can ask questions)
    }

    // 2) Intent + lead scoring
    const detectedIntent = await this.intents.classify(text, tenantSlug);
    const leadScore = await this.leadScorer.scoreConversation([text]);

    // ✅ ADD: escalate key intents + hot leads
    await this.escalation.maybeEscalate({
      tenantSlug,
      platform,
      conversationId,
      userIdentifier: recipientId ?? threadId,
      userText: text,
      intent: String(detectedIntent),
      leadScore,
    });

    // 3) Routing: Business hours gate (optional behavior: only for appointment/availability)
    const isAppointmentIntent =
      detectedIntent === UserIntent.SCHEDULE_APPOINTMENT ||
      detectedIntent === UserIntent.ASK_AVAILABILITY;

    if (isAppointmentIntent) {
      const open = await this.businessHours.isBusinessOpen(tenantSlug);

      if (!open) {
        const closedReply =
          "We’re currently closed, but I can still book you in. What day/time works best for you?";

        await this.outbound.enqueueOutbound({
          tenantSlug,
          platform,
          recipientId: recipientId ?? threadId,
          text: closedReply,
        });

        return { ok: true, businessClosed: true };
      }

      // Offer slots and persist state for confirmation
      const slots = await this.appointments.getAvailableSlotsForTenant(tenantSlug);

      await this.conversations.mergeMetadataDeep(tenantSlug, conversationId, {
        appointment: {
          pending: true,
          offeredSlots: slots,
          offeredAt: new Date().toISOString(),
        },
      });

      const slotLines = slots.map((s, i) => `${i + 1}) ${s}`).join('\n');
      const reply =
        `Here are the next available times:\n${slotLines}\n\nReply with 1, 2, or 3 to confirm.`;

      await this.outbound.enqueueOutbound({
        tenantSlug,
        platform,
        recipientId: recipientId ?? threadId,
        text: reply,
      });

      return { ok: true, appointmentOffered: true };
    }

    // 4) Routing: Quotes (deterministic pricing)
    if (detectedIntent === UserIntent.REQUEST_QUOTE || detectedIntent === UserIntent.PRICE_SHOPPING) {
      const urgency = this.detectUrgency(text);
      const serviceType = this.detectServiceType(text);

      const price = await this.quotes.generateQuote(
        {
          serviceType,
          urgency,
        },
        tenantSlug,
      );

      const reply = `Estimated price for ${serviceType} (${urgency}): $${price}`;

      await this.outbound.enqueueOutbound({
        tenantSlug,
        platform,
        recipientId: recipientId ?? threadId,
        text: reply,
      });

      // ✅ ADD: escalate urgent quotes
      await this.escalation.maybeEscalate({
        tenantSlug,
        platform,
        conversationId,
        userIdentifier: recipientId ?? threadId,
        userText: text,
        intent: String(detectedIntent),
        leadScore,
        quote: { urgency, price, serviceType },
      });

      return { ok: true, quoteSent: true };
    }

    // 5) Default: AI response
    const aiResult = await this.ai.generateResponse({
      tenantSlug,
      userText: text,
    });

    if (!aiResult.ok || !aiResult.text || aiResult.text.trim().length === 0) {
      this.logger.warn(
        JSON.stringify({
          event: 'ai_failed_or_empty',
          jobId: String(job.id),
          tenantSlug,
          platform,
          conversationId,
          ok: aiResult.ok,
          circuitState: aiResult.circuitState,
        }),
        'MessageProcessor',
      );

      // Safe fallback message
      const fallback = "Got it — can you share a bit more detail so I can help you fast?";
      await this.outbound.enqueueOutbound({
        tenantSlug,
        platform,
        recipientId: recipientId ?? threadId,
        text: fallback,
      });

      return { ok: true, aiFallback: true };
    }

    await this.outbound.enqueueOutbound({
      tenantSlug,
      platform,
      recipientId: recipientId ?? threadId,
      text: aiResult.text.trim(),
    });

    return { ok: true };
  }

  private asSupportedPlatform(input: any): SupportedPlatform | null {
    if (input === 'facebook' || input === 'instagram' || input === 'whatsapp') return input;
    return null;
  }

  private extractTextFallback(platform: SupportedPlatform, payload: any): string {
    try {
      if (platform === 'facebook' || platform === 'instagram') {
        const text =
          payload?.entry?.[0]?.messaging?.[0]?.message?.text ??
          payload?.entry?.[0]?.messaging?.[0]?.message?.quick_reply?.payload ??
          '';
        return typeof text === 'string' ? text : '';
      }

      if (platform === 'whatsapp') {
        const text =
          payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body ??
          payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.button?.text ??
          payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.interactive?.button_reply?.title ??
          payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.interactive?.list_reply?.title ??
          '';
        return typeof text === 'string' ? text : '';
      }

      return '';
    } catch {
      return '';
    }
  }

  private coercePayload(input: any): any {
    try {
      if (input && typeof input === 'object' && input.type !== 'Buffer') {
        return input;
      }

      if (
        input &&
        typeof input === 'object' &&
        input.type === 'Buffer' &&
        Array.isArray(input.data)
      ) {
        const raw = Buffer.from(input.data).toString('utf8');
        return JSON.parse(raw);
      }

      if (typeof input === 'string') {
        return JSON.parse(input);
      }

      return input;
    } catch {
      return input;
    }
  }

  // ===== Appointment confirmation helpers =====

  private pickConfirmedSlot(userText: string, offeredSlots: string[]): string | null {
    const t = (userText || '').trim().toLowerCase();

    // numeric confirmation: "1", "2", "3"
    if (/^[1-9]$/.test(t)) {
      const idx = Number(t) - 1;
      if (idx >= 0 && idx < offeredSlots.length) return offeredSlots[idx];
    }

    // allow "slot text" confirmation
    for (const slot of offeredSlots) {
      if (slot && t.includes(slot.toLowerCase())) return slot;
    }

    // allow "first/second/third"
    if (t.includes('first') && offeredSlots[0]) return offeredSlots[0];
    if (t.includes('second') && offeredSlots[1]) return offeredSlots[1];
    if (t.includes('third') && offeredSlots[2]) return offeredSlots[2];

    return null;
  }

  // ===== Quote helpers (deterministic) =====

  private detectUrgency(text: string): 'standard' | 'same-day' | 'emergency' {
    const t = (text || '').toLowerCase();
    if (t.includes('emergency') || t.includes('urgent') || t.includes('asap')) return 'emergency';
    if (t.includes('same day') || t.includes('same-day') || t.includes('today')) return 'same-day';
    return 'standard';
  }

  private detectServiceType(text: string): string {
    const t = (text || '').toLowerCase();

    // Keep this intentionally minimal + safe (you can expand per-tenant later)
    if (t.includes('deep') && t.includes('clean')) return 'deep-clean';
    if (t.includes('apartment')) return 'apartment';
    if (t.includes('house')) return 'house';

    return 'house';
  }
}
