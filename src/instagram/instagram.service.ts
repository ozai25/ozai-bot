// src/instagram/instagram.service.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { LoggerService } from '../observability/logger.service';
import { verifyInstagramSignature } from '../platform/instagram-signature.util';

export type InstagramNormalizedInbound = {
  platform: 'instagram';
  userIdentifier: string;
  content: string;
  platformThreadId?: string;
  metadata?: Record<string, unknown>;
};

type InstagramWebhookBody = Record<string, unknown>;

@Injectable()
export class InstagramService {
  constructor(
    private readonly config: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  isEnabled(): boolean {
    // Commonly needed for IG Graph: IG_ACCESS_TOKEN / PAGE token depending on setup.
    const token = String(this.config.get<string>('INSTAGRAM_ACCESS_TOKEN') ?? '').trim();
    return Boolean(token);
  }

  verifySignature(headers: Record<string, any>, rawBody: Buffer): void {
    const appSecret = String(this.config.get<string>('INSTAGRAM_APP_SECRET') ?? '').trim();

    const sigHeader =
      String(headers?.['x-hub-signature-256'] ?? headers?.['X-Hub-Signature-256'] ?? '').trim();

    const result = verifyInstagramSignature({
      rawBody,
      headerValue: sigHeader,
      appSecret,
    });

    if (!result.ok) {
      this.logger.warn(`Instagram signature rejected: ${result.reason}`, 'InstagramService');
      throw new UnauthorizedException('Unauthorized');
    }
  }

  normalize(body: InstagramWebhookBody): InstagramNormalizedInbound | null {
    // IG payloads can vary by subscription type; keep this conservative.
    // Common shape: { entry: [{ messaging: [{ sender, recipient, message: { text } }] }] }
    const entry = Array.isArray((body as any).entry) ? (body as any).entry[0] : null;
    const messaging = entry && Array.isArray(entry.messaging) ? entry.messaging[0] : null;

    const senderId = messaging?.sender?.id;
    const recipientId = messaging?.recipient?.id;
    const text = messaging?.message?.text;

    if (!senderId || !text) return null;

    return {
      platform: 'instagram',
      userIdentifier: String(senderId).trim(),
      content: String(text).trim().slice(0, 4000),
      platformThreadId: recipientId !== undefined ? String(recipientId).trim() : undefined,
      metadata: {
        instagram: {
          entry_id: entry?.id ?? null,
          time: entry?.time ?? null,
          messaging: {
            mid: messaging?.message?.mid ?? null,
          },
        },
      },
    };
  }

  handleWebhook(params: {
    headers: Record<string, any>;
    rawBody: Buffer;
    body: unknown;
  }): { status: 'ok' | 'ignored'; normalized?: InstagramNormalizedInbound } {
    if (!this.isEnabled()) {
      this.logger.warn('Instagram webhook hit but INSTAGRAM_ACCESS_TOKEN not configured. Ignoring.', 'InstagramService');
      return { status: 'ignored' };
    }

    this.verifySignature(params.headers, params.rawBody);

    const normalized = this.normalize((params.body ?? {}) as InstagramWebhookBody);
    if (!normalized) return { status: 'ignored' };

    return { status: 'ok', normalized };
  }
}
