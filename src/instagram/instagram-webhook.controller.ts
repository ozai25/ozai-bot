import { Controller, Get, Post, Query, Param, Req, Body } from '@nestjs/common';
import type { Request } from 'express';

import { InboundProducer } from '../queues/producers/inbound.producer';
import { LoggerService } from '../observability/logger.service';

@Controller('/webhooks/instagram/:tenantSlug')
export class InstagramWebhookController {
  constructor(
    private readonly inboundProducer: InboundProducer,
    private readonly logger: LoggerService,
  ) {}

  @Get()
  async verify(@Query() query: any) {
    return query['hub.challenge'] ? String(query['hub.challenge']) : 'ok';
  }

  @Post()
  async inbound(
    @Req() _req: Request & { rawBody?: Buffer },
    @Body() body: any,
    @Param('tenantSlug') tenantSlug: string,
  ) {
    const job = await this.inboundProducer.enqueueInbound({
      tenantSlug,
      platform: 'instagram',
      payload: body,
    });

    this.logger.log(
      JSON.stringify({
        event: 'instagram_webhook_enqueued',
        tenantSlug,
        jobId: String(job.jobId),
      }),
      'InstagramWebhookController',
    );

    return { ok: true, jobId: job.jobId, tenantSlug };
  }
}
