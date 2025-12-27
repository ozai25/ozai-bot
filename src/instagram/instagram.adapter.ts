import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

import { LoggerService } from '../observability/logger.service';
import { NormalizedInboundMessageDto, MessagingPlatform, MessageType } from '../dto/normalized-inbound-message.dto';

@Injectable()
export class InstagramAdapter {
  constructor(private readonly logger: LoggerService) {}

  normalizeInbound(payload: any, tenantSlug: string): NormalizedInboundMessageDto {
    const entry = payload?.entry?.[0];
    const messaging = entry?.messaging?.[0];

    const senderId =
      messaging?.sender?.id ||
      entry?.id ||
      'unknown';

    const text =
      messaging?.message?.text ||
      messaging?.message?.quick_reply?.payload ||
      undefined;

    const platformThreadId =
      messaging?.recipient?.id ||
      entry?.id ||
      'unknown';

    return {
      messageId: uuidv4(),
      platform: MessagingPlatform.INSTAGRAM,
      tenantSlug,
      platformThreadId,
      senderPlatformId: String(senderId),
      senderName: undefined,
      messageType: text ? MessageType.TEXT : MessageType.UNKNOWN,
      text,
      rawPayload: payload,
      receivedAt: new Date().toISOString(),
    };
  }

  // ✅ Phase 3 (stub): outbound send
  async sendText(params: { tenantSlug: string; recipientId: string; text: string }): Promise<void> {
    const { tenantSlug, recipientId, text } = params;

    this.logger.log(
      JSON.stringify({
        event: 'instagram_send_text_stub',
        tenantSlug,
        recipientId,
        textLen: text?.length ?? 0,
        preview: (text ?? '').slice(0, 120),
      }),
      'InstagramAdapter',
    );
  }
}
