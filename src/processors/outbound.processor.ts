import { Injectable } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

import { LoggerService } from '../observability/logger.service';
import { FacebookSenderService } from '../facebook/facebook.sender.service';

// ✅ ADD
import { WhatsAppSenderService } from '../whatsapp/whatsapp.sender.service';
import { InstagramSenderService } from '../instagram/instagram.sender.service';

// ✅ ADD: escalation wiring
import { EscalationService } from '../alerts/escalation.service';

type OutboundPlatform = 'facebook' | 'instagram' | 'whatsapp';

@Processor('send-message')
@Injectable()
export class OutboundProcessor extends WorkerHost {
  constructor(
    private readonly logger: LoggerService,
    private readonly facebookSender: FacebookSenderService,

    // ✅ ADD
    private readonly whatsappSender: WhatsAppSenderService,
    private readonly instagramSender: InstagramSenderService,

    // ✅ ADD
    private readonly escalation: EscalationService,
  ) {
    super();
  }

  async process(job: Job<any>): Promise<any> {
    const data = job.data ?? {};

    const tenantSlug: string = data.tenantSlug;
    const platformRaw: string = data.platform;
    const recipientId: string = data.recipientId;
    const text: string = data.text;

    const platform = this.coercePlatform(platformRaw);

    this.logger.log(
      JSON.stringify({
        event: 'outbound_job_received',
        jobId: String(job.id),
        queue: job.queueName,
        tenantSlug,
        platform: platformRaw,
        platformCoerced: platform ?? '(invalid)',
        recipientId,
        textLen: typeof text === 'string' ? text.length : 0,
        receivedAt: new Date().toISOString(),
        attemptsMade: job.attemptsMade ?? 0,
      }),
      'OutboundProcessor',
    );

    // ✅ Guard: ensure payload is valid (hard fail so BullMQ can retry based on job opts)
    if (!tenantSlug || !platform || !recipientId || !text || text.trim().length === 0) {
      this.logger.error(
        JSON.stringify({
          event: 'outbound_job_invalid_payload',
          jobId: String(job.id),
          tenantSlug,
          platform: platformRaw,
          platformCoerced: platform ?? '(invalid)',
          recipientId,
          hasText: typeof text === 'string' && text.trim().length > 0,
        }),
        '',
        'OutboundProcessor',
      );

      // ✅ ADD: escalate invalid outbound payload (critical)
      await this.safeEscalate({
        tenantSlug,
        platform: platformRaw,
        userIdentifier: recipientId,
        userText: `Outbound invalid payload. jobId=${String(job.id)} platformRaw=${String(
          platformRaw,
        )}`,
        intent: 'human_handoff',
      });

      throw new Error('OutboundProcessor: invalid job payload');
    }

    // ✅ Dispatch by platform (NO extra params; sender services resolve secrets internally)
    if (platform === 'facebook') {
      const result = await this.facebookSender.sendText({
        tenantSlug,
        recipientId,
        text: text.trim(),
      });

      if (!result.ok) {
        this.logger.error(
          JSON.stringify({
            event: 'facebook_message_send_failed',
            jobId: String(job.id),
            tenantSlug,
            recipientId,
            error: result.error,
            attemptsMade: job.attemptsMade ?? 0,
          }),
          '',
          'OutboundProcessor',
        );

        // ✅ ADD: escalate on send failure (critical)
        await this.safeEscalate({
          tenantSlug,
          platform,
          userIdentifier: recipientId,
          userText: `Facebook send failed. jobId=${String(job.id)} attemptsMade=${
            job.attemptsMade ?? 0
          } error=${String(result.error ?? '')}`.slice(0, 3500),
          intent: 'human_handoff',
        });

        // Throw to allow BullMQ retry/backoff (configured on producer)
        throw new Error(result.error || 'FacebookSenderService: send failed');
      }

      this.logger.log(
        JSON.stringify({
          event: 'facebook_message_sent',
          jobId: String(job.id),
          tenantSlug,
          recipientId,
          messageId: result.messageId,
          textLen: text.trim().length,
        }),
        'OutboundProcessor',
      );

      return { ok: true };
    }

    if (platform === 'whatsapp') {
      const result = await this.whatsappSender.sendText({
        tenantSlug,
        to: recipientId,
        text: text.trim(),
      });

      if (!result.ok) {
        this.logger.error(
          JSON.stringify({
            event: 'whatsapp_message_send_failed',
            jobId: String(job.id),
            tenantSlug,
            recipientId,
            error: result.error,
            attemptsMade: job.attemptsMade ?? 0,
          }),
          '',
          'OutboundProcessor',
        );

        // ✅ ADD: escalate on send failure (critical)
        await this.safeEscalate({
          tenantSlug,
          platform,
          userIdentifier: recipientId,
          userText: `WhatsApp send failed. jobId=${String(job.id)} attemptsMade=${
            job.attemptsMade ?? 0
          } error=${String(result.error ?? '')}`.slice(0, 3500),
          intent: 'human_handoff',
        });

        throw new Error(result.error || 'WhatsAppSenderService: send failed');
      }

      this.logger.log(
        JSON.stringify({
          event: 'whatsapp_message_sent',
          jobId: String(job.id),
          tenantSlug,
          recipientId,
          messageId: result.messageId,
          textLen: text.trim().length,
        }),
        'OutboundProcessor',
      );

      return { ok: true };
    }

    if (platform === 'instagram') {
      const result = await this.instagramSender.sendText({
        tenantSlug,
        recipientId,
        text: text.trim(),
      });

      if (!result.ok) {
        this.logger.error(
          JSON.stringify({
            event: 'instagram_message_send_failed',
            jobId: String(job.id),
            tenantSlug,
            recipientId,
            error: result.error,
            attemptsMade: job.attemptsMade ?? 0,
          }),
          '',
          'OutboundProcessor',
        );

        // ✅ ADD: escalate on send failure (critical)
        await this.safeEscalate({
          tenantSlug,
          platform,
          userIdentifier: recipientId,
          userText: `Instagram send failed. jobId=${String(job.id)} attemptsMade=${
            job.attemptsMade ?? 0
          } error=${String(result.error ?? '')}`.slice(0, 3500),
          intent: 'human_handoff',
        });

        throw new Error(result.error || 'InstagramSenderService: send failed');
      }

      this.logger.log(
        JSON.stringify({
          event: 'instagram_message_sent',
          jobId: String(job.id),
          tenantSlug,
          recipientId,
          messageId: result.messageId,
          textLen: text.trim().length,
        }),
        'OutboundProcessor',
      );

      return { ok: true };
    }

    // Should be unreachable because of coercion above, but belt+suspenders
    this.logger.warn(
      JSON.stringify({
        event: 'outbound_platform_not_supported',
        jobId: String(job.id),
        tenantSlug,
        platform: platformRaw,
      }),
      'OutboundProcessor',
    );

    // ✅ ADD: escalate unsupported platform (critical)
    await this.safeEscalate({
      tenantSlug,
      platform: platformRaw,
      userIdentifier: recipientId,
      userText: `Outbound unsupported platform. jobId=${String(job.id)} platformRaw=${String(
        platformRaw,
      )}`,
      intent: 'human_handoff',
    });

    // Hard fail so it is visible (and not silently "ok")
    throw new Error(`OutboundProcessor: unsupported platform: ${platformRaw}`);
  }

  // ✅ ADD: safe escalation wrapper (never breaks the worker)
  private async safeEscalate(input: {
    tenantSlug: string;
    platform: string;
    conversationId?: string;
    userIdentifier?: string;
    userText?: string;
    intent?: string;
  }): Promise<void> {
    try {
      await this.escalation.maybeEscalate({
        tenantSlug: input.tenantSlug,
        platform: input.platform,
        conversationId: input.conversationId,
        userIdentifier: input.userIdentifier,
        userText: input.userText,
        intent: input.intent,
      });
    } catch (e: any) {
      this.logger.warn(
        JSON.stringify({
          event: 'outbound_escalation_failed',
          tenantSlug: input.tenantSlug,
          platform: input.platform,
          error: e?.message ?? 'unknown_error',
        }),
        'OutboundProcessor',
      );
    }
  }

  // ✅ ADD: strict platform coercion
  private coercePlatform(input: any): OutboundPlatform | null {
    const p = String(input ?? '').trim().toLowerCase();
    if (p === 'facebook' || p === 'instagram' || p === 'whatsapp') return p;
    return null;
  }
}
