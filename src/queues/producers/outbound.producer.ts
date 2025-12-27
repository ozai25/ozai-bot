// src/queues/producers/outbound.producer.ts
import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { createHash } from 'crypto';
import { LoggerService } from '../../observability/logger.service';

export type OutboundPlatform = 'facebook' | 'instagram' | 'whatsapp';

export interface SendMessageQueueJob {
  tenantSlug: string;
  platform: OutboundPlatform;
  recipientId: string;
  text: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class OutboundProducer {
  constructor(
    @InjectQueue('send-message')
    private readonly queue: Queue,
    private readonly logger: LoggerService,
  ) {}

  /**
   * ✅ REQUIRED (because MessageProcessor calls this)
   * Adds an outbound send job to send-message queue
   */
  async enqueueOutbound(input: SendMessageQueueJob): Promise<{ ok: true; jobId: string | number | null }> {
    const tenantSlug = String(input.tenantSlug ?? '').trim().toLowerCase();
    const platform = String(input.platform ?? '').trim().toLowerCase() as OutboundPlatform;
    const recipientId = String(input.recipientId ?? '').trim();
    const text = String(input.text ?? '').trim();

    const idempotencyKey = createHash('sha256')
      .update(`${tenantSlug}:${recipientId}:${text}:${Date.now()}`)
      .digest('hex');

    const job = await this.queue.add(
      'send-message',
      {
        tenantSlug,
        platform,
        recipientId,
        text,
        // keep metadata in the job payload for audits/debug (worker will ignore if senders don't accept it)
        metadata: input.metadata ?? undefined,
      },
      {
        jobId: idempotencyKey,
        attempts: 3,
        backoff: { type: 'exponential', delay: 500 },
        removeOnComplete: { age: 60 * 60, count: 1000 },
        removeOnFail: { age: 24 * 60 * 60, count: 5000 },
      },
    );

    this.logger.log(
      JSON.stringify({
        event: 'outbound_job_enqueued',
        jobId: String(job.id),
        tenantSlug,
        platform,
        recipientIdLen: recipientId.length,
        textLen: text.length,
        hasMetadata: Boolean(input.metadata && Object.keys(input.metadata).length > 0),
        at: new Date().toISOString(),
      }),
      'OutboundProducer',
    );

    return { ok: true, jobId: job.id ?? null };
  }
}
