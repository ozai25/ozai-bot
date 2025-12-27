import {
  Controller,
  Get,
  Post,
  Query,
  Req,
  Headers,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import { TenantResolutionGuard } from '../security/tenant-resolution.guard';
import { TenantContext } from '../common/decorators/tenant-context.decorator';
import type { Tenant } from '../database/entities/core/tenant.entity';
import { WhatsAppService } from './whatsapp.service';

@Controller('webhooks/whatsapp/:tenantSlug')
@UseGuards(TenantResolutionGuard)
export class WhatsAppWebhookController {
  constructor(private readonly whatsappService: WhatsAppService) {}

  @Get()
  verify(
    @Query() query: any,
    @TenantContext() tenant: Tenant,
  ) {
    return this.whatsappService.verifyWebhook(query, tenant);
  }

  @Post()
  async inbound(
    @Req() req: Request,
    @Headers('x-hub-signature-256') signature: string | undefined,
    @TenantContext() tenant: Tenant,
  ) {
    // IMPORTANT: /webhooks/* is configured with express.raw()
    // so req.body MUST be a Buffer for signature verification + parsing.
    const rawBody = req.body as unknown;

    if (!Buffer.isBuffer(rawBody)) {
      throw new UnauthorizedException('Raw body not available (rawBody missing)');
    }

    return this.whatsappService.handleInbound(
      rawBody,
      signature,
      tenant,
    );
  }
}
