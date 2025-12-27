// src/processors/send-reply.processor.ts
import { Injectable } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

import { LoggerService } from '../observability/logger.service';

import { WhatsAppSenderService } from '../whatsapp/whatsapp.sender.service';
import { FacebookSenderService } from '../facebook/facebook.sender.service';
import { InstagramSenderService } from '../instagram/instagram.sender.service';

type SupportedPlatform = 'facebook' | 'instagram' | 'whatsapp';

export interface SendMessageQueueJob {
  tenantSlug: string;
  platform: SupportedPlatform;
  recipientId: string;
  text: string;
  metadata?: Record<string, any>;
}

/**
 * ✅ Outbound send worker
 * Queue: send-message
 * Job data: { tenantSlug, platform, recipientId, text, metadata? }
 */
@Processor('send-message')
@Injectable()
export class SendReplyProcessor extends WorkerHost {
  constructor(
    private readonly logger: LoggerService,
    private readonly whatsappSender: WhatsAppSenderService,
    private readonly facebookSender: FacebookSenderService,
    private readonly instagramSender: InstagramSenderService,
  ) {
    super();
  }

  async process(job: Job<SendMessageQueueJob>): Promise<any> {
    const data = (job?.data ?? {}) as Partial<SendMessageQueueJob>;

    const tenantSlug = String(data.tenantSlug ?? '').trim().toLowerCase();
    const platform = this.asSupportedPlatform(data.platform);
    const recipientId = String(data.recipientId ?? '').trim();
    const text = String(data.text ?? '').trim();

    this.logger.log(
      JSON.stringify({
        event: 'send_message_job_received',
        jobId: String(job.id),
        queue: job.queueName,
        tenantSlug,
        platform: data.platform,
        platformCoerced: platform ?? '(invalid)',
        recipientIdLen: recipientId.length,
        textLen: text.length,
        hasMetadata: Boolean(data.metadata && Object.keys(data.metadata).length > 0),
        receivedAt: new Date().toISOString(),
      }),
      'SendReplyProcessor',
    );

    if (!tenantSlug || !platform || !recipientId || !text) {
      this.logger.warn(
        JSON.stringify({
          event: 'send_message_skipped_missing_required_fields',
          jobId: String(job.id),
          tenantSlug,
          platform: data.platform,
          hasTenantSlug: Boolean(tenantSlug),
          hasPlatform: Boolean(platform),
          recipientIdLen: recipientId.length,
          textLen: text.length,
        }),
        'SendReplyProcessor',
      );

      return { ok: true, skipped: true };
    }

    try {
      // ✅ CRITICAL: sender service param contracts do NOT include metadata, so do NOT pass it.
      if (platform === 'whatsapp') {
        await this.whatsappSender.sendText({
          tenantSlug,
          to: recipientId,
          text,
        });
      } else if (platform === 'facebook') {
        await this.facebookSender.sendText({
          tenantSlug,
          recipientId,
          text,
        });
      } else if (platform === 'instagram') {
        await this.instagramSender.sendText({
          tenantSlug,
          recipientId,
          text,
        });
      }

      this.logger.log(
        JSON.stringify({
          event: 'send_message_sent',
          jobId: String(job.id),
          tenantSlug,
          platform,
          recipientIdLen: recipientId.length,
          textLen: text.length,
          sentAt: new Date().toISOString(),
        }),
        'SendReplyProcessor',
      );

      return { ok: true };
    } catch (err: any) {
      this.logger.error(
        JSON.stringify({
          event: 'send_message_failed',
          jobId: String(job.id),
          tenantSlug,
          platform,
          error: String(err?.message ?? err ?? 'unknown_error'),
        }),
        'SendReplyProcessor',
      );
      throw err;
    }
  }

  private asSupportedPlatform(input: any): SupportedPlatform | null {
    if (input === 'facebook' || input === 'instagram' || input === 'whatsapp') return input;
    return null;
  }
}
