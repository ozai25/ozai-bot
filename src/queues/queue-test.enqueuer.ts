// src/queues/queue-test.enqueuer.ts
import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';

import { LoggerService } from '../observability/logger.service';

// ✅ FIX: Queue test enqueuer must use the authoritative queue contract
import {
  buildTestJob,
  PROCESS_MESSAGE_JOB,
  PROCESS_MESSAGE_QUEUE,
  type ProcessMessageQueueJob,
} from './process-message.job';

@Injectable()
export class QueueTestEnqueuer {
  constructor(
    @InjectQueue(PROCESS_MESSAGE_QUEUE)
    private readonly queue: Queue<ProcessMessageQueueJob>,
    private readonly logger: LoggerService,
  ) {}

  async enqueueTestJob(
    tenantSlug: string,
  ): Promise<{ ok: true; jobId: string | number | null }> {
    const jobData: ProcessMessageQueueJob = buildTestJob(tenantSlug);

    const job = await this.queue.add(PROCESS_MESSAGE_JOB, jobData);

    this.logger.log(
      JSON.stringify({
        event: 'queue_test_job_enqueued',
        jobId: String(job.id),
        tenantSlug: jobData.tenantSlug,
        platform: jobData.platform,
      }),
      'QueueTestEnqueuer',
    );

    return { ok: true, jobId: job.id ?? null };
  }
}
