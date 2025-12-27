import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';

import { LoggerService } from '../observability/logger.service';
import {
  NormalizedInboundMessageDto,
  MessagingPlatform,
  MessageType,
} from '../dto/normalized-inbound-message.dto';

@Injectable()
export class WhatsAppAdapter {
  constructor(
    private readonly config: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Normalize WhatsApp inbound webhook payload into our unified DTO.
   * Supports text + location + media stubs (future-proof).
   */
  normalizeInbound(payload: any, tenantSlug: string): NormalizedInboundMessageDto {
    const messageId = randomUUID();
    const receivedAt = new Date().toISOString();

    // WhatsApp standard structure:
    // entry[0].changes[0].value.messages[0]
    const value =
      payload?.entry?.[0]?.changes?.[0]?.value ??
      payload?.entry?.[0]?.changes?.[0] ??
      payload?.value ??
      payload;

    const message = value?.messages?.[0];
    const contact = value?.contacts?.[0];

    const waFrom = message?.from ? String(message.from) : 'unknown_sender';
    const waName =
      contact?.profile?.name ? String(contact.profile.name) : undefined;

    // "thread" (conversation) identity for WA: use waFrom for now
    // Later: you can combine phone_number_id + waFrom for uniqueness per tenant
    const platformThreadId = waFrom;

    // Determine type + normalized fields
    let messageType: MessageType = MessageType.UNKNOWN;
    let text: string | undefined;
    let location: { latitude: number; longitude: number } | undefined;
    let media:
      | {
          url?: string;
          mimeType?: string;
          caption?: string;
        }
      | undefined;

    const msgType = message?.type ? String(message.type) : undefined;

    if (msgType === 'text') {
      messageType = MessageType.TEXT;
      text = message?.text?.body ? String(message.text.body) : undefined;
    } else if (msgType === 'location') {
      messageType = MessageType.LOCATION;
      const lat = Number(message?.location?.latitude);
      const lon = Number(message?.location?.longitude);
      if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
        location = { latitude: lat, longitude: lon };
      }
    } else if (msgType === 'image') {
      messageType = MessageType.IMAGE;
      media = {
        mimeType: message?.image?.mime_type ? String(message.image.mime_type) : undefined,
        caption: message?.image?.caption ? String(message.image.caption) : undefined,
      };
    } else if (msgType === 'video') {
      messageType = MessageType.VIDEO;
      media = {
        mimeType: message?.video?.mime_type ? String(message.video.mime_type) : undefined,
        caption: message?.video?.caption ? String(message.video.caption) : undefined,
      };
    } else if (msgType === 'audio') {
      messageType = MessageType.AUDIO;
      media = {
        mimeType: message?.audio?.mime_type ? String(message.audio.mime_type) : undefined,
      };
    } else if (msgType === 'document') {
      messageType = MessageType.FILE;
      media = {
        mimeType: message?.document?.mime_type ? String(message.document.mime_type) : undefined,
        caption: message?.document?.caption ? String(message.document.caption) : undefined,
      };
    }

    return {
      messageId,
      platform: MessagingPlatform.WHATSAPP,
      tenantSlug,
      platformThreadId,
      senderPlatformId: waFrom,
      senderName: waName,
      messageType,
      text,
      media,
      location,
      rawPayload: payload,
      receivedAt,
    };
  }

  /**
   * Phase 3: Send outbound WhatsApp text message (Cloud API).
   * NOTE: This is env-based for now (multi-tenant token routing comes later).
   */
  async sendText(params: {
    tenantSlug: string;
    recipientId: string;
    text: string;
  }): Promise<{ ok: boolean; messageId?: string; error?: string }> {
    const { tenantSlug, recipientId, text } = params;

    const token = this.config.get<string>('whatsapp.accessToken') ?? process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId =
      this.config.get<string>('whatsapp.phoneNumberId') ?? process.env.WHATSAPP_PHONE_NUMBER_ID;
    const apiVersion =
      this.config.get<string>('whatsapp.apiVersion') ?? process.env.WHATSAPP_API_VERSION ?? 'v20.0';

    if (!token || !phoneNumberId) {
      this.logger.warn(
        JSON.stringify({
          event: 'whatsapp_send_skipped_missing_config',
          tenantSlug,
          hasToken: Boolean(token),
          hasPhoneNumberId: Boolean(phoneNumberId),
        }),
        'WhatsAppAdapter',
      );
      return { ok: false, error: 'MISSING_WHATSAPP_CONFIG' };
    }

    const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

    const body = {
      messaging_product: 'whatsapp',
      to: recipientId,
      type: 'text',
      text: { body: text },
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const json: any = await res.json().catch(() => ({}));

      if (!res.ok) {
        this.logger.error(
          JSON.stringify({
            event: 'whatsapp_send_failed',
            tenantSlug,
            recipientId,
            status: res.status,
            response: json,
          }),
          '',
          'WhatsAppAdapter',
        );

        return { ok: false, error: `WHATSAPP_SEND_FAILED_${res.status}` };
      }

      const messageId = json?.messages?.[0]?.id;

      this.logger.log(
        JSON.stringify({
          event: 'whatsapp_send_ok',
          tenantSlug,
          recipientId,
          messageId,
        }),
        'WhatsAppAdapter',
      );

      return { ok: true, messageId };
    } catch (e: any) {
      this.logger.error(
        JSON.stringify({
          event: 'whatsapp_send_exception',
          tenantSlug,
          recipientId,
          error: String(e?.message ?? e),
        }),
        '',
        'WhatsAppAdapter',
      );

      return { ok: false, error: 'WHATSAPP_SEND_EXCEPTION' };
    }
  }
}
