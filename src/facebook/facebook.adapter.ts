import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

import { LoggerService } from '../observability/logger.service';
import {
  MessageType,
  MessagingPlatform,
  NormalizedInboundMessageDto,
} from '../dto/normalized-inbound-message.dto';

@Injectable()
export class FacebookAdapter {
  constructor(private readonly logger: LoggerService) {}

  normalizeInbound(payload: any, tenantSlug: string): NormalizedInboundMessageDto {
    const messagingEvent =
      payload?.entry?.[0]?.messaging?.[0] ?? payload?.entry?.[0]?.messaging?.[0];

    const senderId = messagingEvent?.sender?.id;
    const recipientId = messagingEvent?.recipient?.id;
    const message = messagingEvent?.message;
    const text = message?.text;

    return {
      messageId: message?.mid ?? uuidv4(),
      platform: MessagingPlatform.FACEBOOK,
      tenantSlug,
      platformThreadId: recipientId ?? 'unknown_thread',
      senderPlatformId: senderId ?? 'unknown_sender',
      senderName: undefined,
      messageType: text ? MessageType.TEXT : MessageType.UNKNOWN,
      text: text ?? undefined,
      rawPayload: payload,
      receivedAt: new Date().toISOString(),
    };
  }

  // ✅ Phase 3 (stub): outbound send
  async sendText(params: { tenantSlug: string; recipientId: string; text: string }): Promise<void> {
    const { tenantSlug, recipientId, text } = params;

    // Phase 3 stub: log only (Phase 4 will do real Graph API call)
    this.logger.log(
      JSON.stringify({
        event: 'facebook_send_text_stub',
        tenantSlug,
        recipientId,
        textLen: text?.length ?? 0,
        preview: (text ?? '').slice(0, 120),
      }),
      'FacebookAdapter',
    );
  }
}
