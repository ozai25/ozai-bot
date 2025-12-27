import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { LoggerService } from '../observability/logger.service';

export type FacebookSendTextResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

@Injectable()
export class FacebookSenderService {
  constructor(
    private readonly config: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  async sendText(params: {
    tenantSlug: string;
    recipientId: string; // PSID
    text: string;
  }): Promise<FacebookSendTextResult> {
    const { tenantSlug, recipientId, text } = params;

    const prefix = String(tenantSlug || '').toUpperCase();

    // ✅ tenant-aware token keys (support BOTH naming styles)
    const tenantToken =
      this.config.get<string>(`${prefix}_FB_PAGE_ACCESS_TOKEN`) ??
      this.config.get<string>(`${prefix}_FACEBOOK_PAGE_ACCESS_TOKEN`) ??
      '';

    // ✅ global fallback (optional)
    const fallbackToken =
      this.config.get<string>('FACEBOOK_PAGE_ACCESS_TOKEN') ??
      this.config.get<string>('FACEBOOK_ACCESS_TOKEN') ??
      '';

    const accessToken = tenantToken || fallbackToken;

    const graphVersion =
      this.config.get<string>('FACEBOOK_GRAPH_VERSION')?.trim() || 'v19.0';

    this.logger.log(
      JSON.stringify({
        event: 'facebook_send_token_runtime_check',
        tenantSlug,
        hasTenantToken: Boolean(tenantToken),
        hasFallbackToken: Boolean(fallbackToken),
        hasToken: Boolean(accessToken),
        graphVersion,
        recipientIdPresent: Boolean(recipientId),
        textLen: typeof text === 'string' ? text.length : 0,
      }),
      'FacebookSenderService',
    );

    if (!accessToken) {
      const msg =
        `Missing ${prefix}_FB_PAGE_ACCESS_TOKEN / ${prefix}_FACEBOOK_PAGE_ACCESS_TOKEN (or global FACEBOOK_PAGE_ACCESS_TOKEN)`;
      this.logger.error(
        JSON.stringify({
          event: 'facebook_send_missing_token',
          tenantSlug,
          recipientId,
        }),
        '',
        'FacebookSenderService',
      );
      return { ok: false, error: msg };
    }

    const url = `https://graph.facebook.com/${graphVersion}/me/messages?access_token=${encodeURIComponent(
      accessToken,
    )}`;

    const payload = {
      messaging_type: 'RESPONSE',
      recipient: { id: recipientId },
      message: { text },
    };

    try {
      const started = Date.now();

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const bodyText = await res.text();
      const latencyMs = Date.now() - started;

      let json: any = {};
      try {
        json = bodyText ? JSON.parse(bodyText) : {};
      } catch {
        json = { raw: bodyText };
      }

      if (!res.ok) {
        this.logger.error(
          JSON.stringify({
            event: 'facebook_send_failed',
            tenantSlug,
            recipientId,
            status: res.status,
            latencyMs,
            responseBody: json,
          }),
          '',
          'FacebookSenderService',
        );

        return {
          ok: false,
          error: `Facebook send failed: HTTP ${res.status} - ${bodyText.slice(0, 300)}`,
        };
      }

      const messageId: string | undefined = json?.message_id;

      if (!messageId) {
        const errMsg = `Facebook send returned no message_id: ${bodyText.slice(0, 400)}`;
        this.logger.error(
          JSON.stringify({
            event: 'facebook_send_unexpected_response',
            tenantSlug,
            recipientId,
            latencyMs,
            error: errMsg,
          }),
          '',
          'FacebookSenderService',
        );
        return { ok: false, error: errMsg };
      }

      this.logger.log(
        JSON.stringify({
          event: 'facebook_send_ok',
          tenantSlug,
          recipientId,
          latencyMs,
          messageId,
        }),
        'FacebookSenderService',
      );

      return { ok: true, messageId };
    } catch (e: any) {
      this.logger.error(
        JSON.stringify({
          event: 'facebook_send_exception',
          tenantSlug,
          recipientId,
          error: String(e?.message ?? e),
        }),
        '',
        'FacebookSenderService',
      );

      return { ok: false, error: String(e?.message ?? e) };
    }
  }
}
