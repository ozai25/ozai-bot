import { Injectable, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { Tenant } from '../database/entities/core/tenant.entity';
import { LoggerService } from '../observability/logger.service';
import { WhatsAppSignatureService } from '../security/whatsapp-signature.service';

@Injectable()
export class WhatsAppService {
  constructor(
    @InjectQueue('process-message')
    private readonly queue: Queue,
    private readonly logger: LoggerService,
    private readonly signatureService: WhatsAppSignatureService,
  ) {}

  /**
   * GET verification endpoint handler
   * WhatsApp/Meta sends:
   *  - hub.mode
   *  - hub.verify_token
   *  - hub.challenge
   */
  verifyWebhook(query: any, tenant: Tenant): string {
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    const expectedToken = tenant.apiKeys?.whatsapp?.verifyToken;

    if (!expectedToken) {
      this.logger.error(
        `Missing WhatsApp verify token for tenant: ${tenant.slug}`,
        '',
        'WhatsAppService',
      );
      throw new ForbiddenException('WhatsApp verify token not configured');
    }

    if (mode !== 'subscribe') {
      this.logger.warn(
        `Invalid hub.mode: ${mode} for tenant: ${tenant.slug}`,
        'WhatsAppService',
      );
      throw new ForbiddenException('Invalid mode');
    }

    if (!token || token !== expectedToken) {
      this.logger.warn(
        `Webhook verify token mismatch for tenant: ${tenant.slug}`,
        'WhatsAppService',
      );
      throw new ForbiddenException('Verification failed');
    }

    if (!challenge) {
      throw new ForbiddenException('Missing challenge');
    }

    this.logger.log(
      `Webhook verified for tenant: ${tenant.slug}`,
      'WhatsAppService',
    );

    return String(challenge);
  }

  /**
   * POST inbound webhook handler
   * Uses raw body + x-hub-signature-256 for signature validation,
   * then enqueues a job to process-message queue.
   */
  async handleInbound(
    rawBody: Buffer,
    signature: string | undefined,
    tenant: Tenant,
  ) {
    const devBypass =
      process.env.NODE_ENV !== 'production' &&
      process.env.WHATSAPP_DEV_BYPASS_SIGNATURE === 'true';

    if (!devBypass) {
      if (!signature) {
        this.logger.warn(
          `Missing WhatsApp signature header for tenant=${tenant.slug}`,
          'WhatsAppService',
        );
        throw new UnauthorizedException('Invalid signature');
      }

      const verification = await this.signatureService.verify(
        rawBody,
        signature,
        tenant,
      );

      if (!verification.valid) {
        this.logger.warn(
          `Invalid WhatsApp signature for tenant=${tenant.slug} (${verification.reason || 'unknown'})`,
          'WhatsAppService',
        );
        throw new UnauthorizedException('Invalid signature');
      }
    } else {
      this.logger.warn(
        `DEV BYPASS ENABLED: Skipping WhatsApp signature verification for tenant=${tenant.slug}`,
        'WhatsAppService',
      );
    }

    const payload = JSON.parse(rawBody.toString('utf8'));

    const job = await this.queue.add('process-message', {
      tenantSlug: tenant.slug,
      platform: 'whatsapp',
      payload,
    });

    return {
      ok: true,
      jobId: job.id,
      tenantSlug: tenant.slug,
    };
  }
}
