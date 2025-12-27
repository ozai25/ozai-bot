import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { LoggerService } from '../observability/logger.service';

export interface WhatsAppSendTextParams {
  tenantSlug: string;
  to: string;
  text: string;
}

// ✅ FIX: discriminated union so TS can narrow after `if (!result.ok)`
export type WhatsAppSendTextResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

@Injectable()
export class WhatsAppSenderService {
  private readonly apiVersion: string;
  private readonly baseUrl: string;

  // additive hardening knobs (safe defaults)
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;

  constructor(
    private readonly config: ConfigService,
    private readonly logger: LoggerService,
  ) {
    this.apiVersion = this.config.get<string>('WHATSAPP_API_VERSION', 'v18.0');
    this.baseUrl = this.config.get<string>(
      'WHATSAPP_BASE_URL',
      'https://graph.facebook.com',
    );

    this.timeoutMs = Number(this.config.get<string>('WHATSAPP_SEND_TIMEOUT_MS', '8000'));
    this.maxAttempts = Number(this.config.get<string>('WHATSAPP_SEND_MAX_ATTEMPTS', '3'));
    this.baseDelayMs = Number(this.config.get<string>('WHATSAPP_SEND_BASE_DELAY_MS', '250'));
    this.maxDelayMs = Number(this.config.get<string>('WHATSAPP_SEND_MAX_DELAY_MS', '2500'));
  }

  async sendText(params: WhatsAppSendTextParams): Promise<WhatsAppSendTextResult> {
    const { tenantSlug, to, text } = params;

    if (!tenantSlug) return { ok: false, error: 'WhatsAppSenderService: tenantSlug missing' };
    if (!to) return { ok: false, error: 'WhatsAppSenderService: to missing' };
    if (!text) return { ok: false, error: 'WhatsAppSenderService: text missing' };

    const prefix = tenantSlug.toUpperCase();

    const phoneNumberId = this.config.get<string>(`${prefix}_WA_PHONE_NUMBER_ID`, '');
    const accessToken = this.config.get<string>(`${prefix}_WA_ACCESS_TOKEN`, '');

    if (!phoneNumberId) {
      return { ok: false, error: `WhatsAppSenderService: ${prefix}_WA_PHONE_NUMBER_ID missing` };
    }
    if (!accessToken) {
      return { ok: false, error: `WhatsAppSenderService: ${prefix}_WA_ACCESS_TOKEN missing` };
    }

    const url = `${this.baseUrl}/${this.apiVersion}/${phoneNumberId}/messages`;

    this.logger.log(
      JSON.stringify({
        event: 'whatsapp_send_attempt',
        tenantSlug,
        to,
        textLen: text.length,
        apiVersion: this.apiVersion,
      }),
      'WhatsAppSenderService',
    );

    try {
      const responseData = await this.requestWithRetry(
        async (signal) => {
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            signal,
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              recipient_type: 'individual',
              to,
              type: 'text',
              text: {
                preview_url: false,
                body: text,
              },
            }),
          });

          const json = await res.json().catch(() => ({} as any));

          if (!res.ok) {
            const err: any = new Error(
              `WhatsApp send failed: ${res.status} - ${JSON.stringify(json)}`,
            );
            err.status = res.status;
            err.payload = json;
            throw err;
          }

          return json;
        },
        { tenantSlug, to },
      );

      const messageId = responseData?.messages?.[0]?.id;

      if (!messageId) {
        const errMsg = `WhatsApp send returned no message id: ${JSON.stringify(responseData)}`;
        this.logger.error(
          JSON.stringify({
            event: 'whatsapp_send_unexpected_response',
            tenantSlug,
            to,
            error: errMsg,
          }),
          '',
          'WhatsAppSenderService',
        );
        return { ok: false, error: errMsg };
      }

      this.logger.log(
        JSON.stringify({
          event: 'whatsapp_message_sent',
          tenantSlug,
          to,
          messageId,
        }),
        'WhatsAppSenderService',
      );

      return { ok: true, messageId };
    } catch (e: any) {
      const errMsg = e?.message ?? 'WhatsAppSenderService: unknown error';

      this.logger.error(
        JSON.stringify({
          event: 'whatsapp_send_exception',
          tenantSlug,
          to,
          error: errMsg,
          status: e?.status,
        }),
        '',
        'WhatsAppSenderService',
      );

      return { ok: false, error: errMsg };
    }
  }

  // ====== internal helpers (additive, isolated) ======

  private async requestWithRetry<T>(
    fn: (signal: AbortSignal) => Promise<T>,
    meta: { tenantSlug: string; to: string },
  ): Promise<T> {
    let attempt = 0;
    let lastErr: any;

    while (attempt < this.maxAttempts) {
      attempt += 1;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      const startedAt = Date.now();

      try {
        const result = await fn(controller.signal);
        const durationMs = Date.now() - startedAt;

        this.logger.log(
          JSON.stringify({
            event: 'whatsapp_http_ok',
            tenantSlug: meta.tenantSlug,
            to: meta.to,
            attempt,
            durationMs,
          }),
          'WhatsAppSenderService',
        );

        return result;
      } catch (err: any) {
        lastErr = err;

        const durationMs = Date.now() - startedAt;
        const isTimeout = err?.name === 'AbortError';
        const status = err?.status;

        const retryable =
          isTimeout ||
          status === 429 ||
          (typeof status === 'number' && status >= 500 && status <= 599);

        this.logger.warn(
          JSON.stringify({
            event: 'whatsapp_http_fail',
            tenantSlug: meta.tenantSlug,
            to: meta.to,
            attempt,
            durationMs,
            isTimeout,
            status,
            retryable,
            error: err?.message,
          }),
          'WhatsAppSenderService',
        );

        if (!retryable || attempt >= this.maxAttempts) break;

        await this.sleep(this.computeBackoffMs(attempt));
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastErr ?? new Error('WhatsAppSenderService: request failed');
  }

  private computeBackoffMs(attempt: number): number {
    const exp = Math.min(this.maxDelayMs, this.baseDelayMs * Math.pow(2, attempt - 1));
    const jitter = Math.floor(Math.random() * 120);
    return Math.min(this.maxDelayMs, exp + jitter);
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
