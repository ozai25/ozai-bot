// src/app.controller.ts
import { Controller, Get, Query } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

// ✅ FIX: AppController enqueue test must use the authoritative queue contract
import {
  buildTestJob,
  PROCESS_MESSAGE_JOB,
  PROCESS_MESSAGE_QUEUE,
  type ProcessMessageQueueJob,
} from './queues/process-message.job';

@Controller()
export class AppController {
  constructor(
    @InjectQueue(PROCESS_MESSAGE_QUEUE)
    private readonly processMessageQueue: Queue<ProcessMessageQueueJob>,
  ) {}

  @Get('test/enqueue')
  async enqueueTest(@Query('tenant') tenantSlug?: string) {
    const tenant = tenantSlug || process.env.DEFAULT_TENANT_SLUG || 'oz01';

    const payload: ProcessMessageQueueJob = buildTestJob(tenant);

    const job = await this.processMessageQueue.add(PROCESS_MESSAGE_JOB, payload, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 500 },
      removeOnComplete: true,
      removeOnFail: false,
    });

    return {
      ok: true,
      jobId: job.id,
      tenantSlug: tenant,
    };
  }
}
