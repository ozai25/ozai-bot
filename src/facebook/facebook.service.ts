// src/facebook/facebook.service.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { LoggerService } from '../observability/logger.service';
import { verifyFacebookSignature } from '../platform/facebook-signature.util';

export type FacebookNormalizedInbound = {
  platform: 'facebook';
  userIdentifier: string;
  content: string;
  platformThreadId?: string;
  metadata?: Record<string, unknown>;
};

type FacebookWebhookBody = Record<string, unknown>;

@Injectable()
export class FacebookService {
  constructor(
    private readonly config: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  isEnabled(): boolean {
    // For FB Messenger sending/processing, you typically need PAGE_ACCESS_TOKEN.
    const token = String(this.config.get<string>('FACEBOOK_PAGE_ACCESS_TOKEN') ?? '').trim();
    return Boolean(token);
  }

  verifySignature(headers: Record<string, any>, rawBody: Buffer): void {
    const appSecret = String(this.config.get<string>('FACEBOOK_APP_SECRET') ?? '').trim();

    // Meta signature header
    const sigHeader =
      String(headers?.['x-hub-signature-256'] ?? headers?.['X-Hub-Signature-256'] ?? '').trim();

    const result = verifyFacebookSignature({
      rawBody,
      headerValue: sigHeader,
      appSecret,
    });

    if (!result.ok) {
      this.logger.warn(`Facebook signature rejected: ${result.reason}`, 'FacebookService');
      throw new UnauthorizedException('Unauthorized');
    }
  }

  /**
   * Minimal normalizer. You can expand this once your inbound DTO contract is finalized.
   * Returns null for unsupported/noise.
   */
  normalize(body: FacebookWebhookBody): FacebookNormalizedInbound | null {
    // Many FB webhook payloads are shaped like { object, entry: [...] }.
    const entry = Array.isArray((body as any).entry) ? (body as any).entry[0] : null;
    const messaging = entry && Array.isArray(entry.messaging) ? entry.messaging[0] : null;

    const senderId = messaging?.sender?.id;
    const recipientId = messaging?.recipient?.id;
    const text = messaging?.message?.text;

    if (!senderId || !text) return null;

    return {
      platform: 'facebook',
      userIdentifier: String(senderId).trim(),
      content: String(text).trim().slice(0, 4000),
      platformThreadId: recipientId !== undefined ? String(recipientId).trim() : undefined,
      metadata: {
        facebook: {
          entry_id: entry?.id ?? null,
          time: entry?.time ?? null,
          messaging: {
            mid: messaging?.message?.mid ?? null,
          },
        },
      },
    };
  }

  /**
   * Controller helper:
   * - feature gate
   * - signature verification
   * - normalization
   */
  handleWebhook(params: {
    headers: Record<string, any>;
    rawBody: Buffer;
    body: unknown;
  }): { status: 'ok' | 'ignored'; normalized?: FacebookNormalizedInbound } {
    if (!this.isEnabled()) {
      this.logger.warn('Facebook webhook hit but FACEBOOK_PAGE_ACCESS_TOKEN not configured. Ignoring.', 'FacebookService');
      return { status: 'ignored' };
    }

    this.verifySignature(params.headers, params.rawBody);

    const normalized = this.normalize((params.body ?? {}) as FacebookWebhookBody);
    if (!normalized) return { status: 'ignored' };

    return { status: 'ok', normalized };
  }
}
