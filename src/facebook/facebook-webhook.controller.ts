import { Controller, Get, Post, Query, Param, Req, Body } from '@nestjs/common';
import type { Request } from 'express';

import { TenantResolutionGuard } from '../security/tenant-resolution.guard';
import { TenantContext } from '../common/decorators/tenant-context.decorator';
import type { Tenant } from '../database/entities/core/tenant.entity';
import { InboundProducer } from '../queues/producers/inbound.producer';
import { LoggerService } from '../observability/logger.service';

@Controller('/webhooks/facebook/:tenantSlug')
export class FacebookWebhookController {
  constructor(
    private readonly inboundProducer: InboundProducer,
    private readonly logger: LoggerService,
  ) {}

  // Optional verification endpoint (Meta uses this)
  @Get()
  async verify(
    @Query() query: any,
    @Param('tenantSlug') tenantSlug: string,
  ) {
    // You can wire verify token later. For now, return challenge if present.
    return query['hub.challenge'] ? String(query['hub.challenge']) : 'ok';
  }

  @Post()
  async inbound(
    @Req() req: Request & { rawBody?: Buffer },
    @Body() body: any,
    @Param('tenantSlug') tenantSlug: string,
  ) {
    // For Facebook we don't need rawBody signature verification here yet.
    // We enqueue immediately just like WhatsApp.
    const job = await this.inboundProducer.enqueueInbound({
      tenantSlug,
      platform: 'facebook',
      payload: body,
    });

    this.logger.log(
      JSON.stringify({
        event: 'facebook_webhook_enqueued',
        tenantSlug,
        jobId: String(job.jobId),
      }),
      'FacebookWebhookController',
    );

    return { ok: true, jobId: job.jobId, tenantSlug };
  }
}
