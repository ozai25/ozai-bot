// src/queues/producers/inbound.producer.ts
import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';

import { LoggerService } from '../../observability/logger.service';
import type { ProcessMessageQueueJob, SupportedInboundPlatform } from '../process-message.job';

@Injectable()
export class InboundProducer {
  constructor(
    @InjectQueue('process-message')
    private readonly queue: Queue,
    private readonly logger: LoggerService,
  ) {}

  /**
   * ✅ Adds an inbound webhook payload to the process-message queue.
   * Contract MUST remain: { tenantSlug, platform, payload }.
   */
  async enqueueInbound(params: {
    tenantSlug: string;
    platform: SupportedInboundPlatform;
    payload: any;
  }): Promise<{ ok: true; jobId: string | number | null; tenantSlug: string }> {
    const tenantSlug = String(params.tenantSlug || '').trim().toLowerCase();
    const platform = String(params.platform || '').trim().toLowerCase() as SupportedInboundPlatform;
    const payload = params.payload;

    if (!tenantSlug) {
      // best-effort safe no-op; avoids poisoning the queue
      this.logger.warn(
        JSON.stringify({ event: 'inbound_job_rejected_missing_tenant', platform }),
        'InboundProducer',
      );
      return { ok: true, jobId: null, tenantSlug: '' };
    }

    if (platform !== 'whatsapp' && platform !== 'facebook' && platform !== 'instagram') {
      this.logger.warn(
        JSON.stringify({
          event: 'inbound_job_rejected_invalid_platform',
          tenantSlug,
          platform,
        }),
        'InboundProducer',
      );
      return { ok: true, jobId: null, tenantSlug };
    }

    const jobData: ProcessMessageQueueJob = { tenantSlug, platform, payload };

    const job = await this.queue.add('process-message', jobData);

    this.logger.log(
      JSON.stringify({
        event: 'inbound_job_enqueued',
        jobId: String(job.id),
        tenantSlug,
        platform,
      }),
      'InboundProducer',
    );

    return { ok: true, jobId: job.id ?? null, tenantSlug };
  }
}
