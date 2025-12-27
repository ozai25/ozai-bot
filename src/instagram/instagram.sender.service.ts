import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { LoggerService } from '../observability/logger.service';

export interface InstagramSendTextParams {
  tenantSlug: string;
  recipientId: string;
  text: string;
}

// ✅ CHANGE: discriminated union (TS-safe)
export type InstagramSendTextResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

@Injectable()
export class InstagramSenderService {
  private readonly apiVersion: string;
  private readonly baseUrl: string;

  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;

  constructor(
    private readonly config: ConfigService,
    private readonly logger: LoggerService,
  ) {
    this.apiVersion = this.config.get<string>('INSTAGRAM_API_VERSION', 'v18.0');
    this.baseUrl = this.config.get<string>('INSTAGRAM_BASE_URL', 'https://graph.facebook.com');

    this.timeoutMs = Number(this.config.get<string>('INSTAGRAM_SEND_TIMEOUT_MS', '8000'));
    this.maxAttempts = Number(this.config.get<string>('INSTAGRAM_SEND_MAX_ATTEMPTS', '3'));
    this.baseDelayMs = Number(this.config.get<string>('INSTAGRAM_SEND_BASE_DELAY_MS', '250'));
    this.maxDelayMs = Number(this.config.get<string>('INSTAGRAM_SEND_MAX_DELAY_MS', '2500'));
  }

  async sendText(params: InstagramSendTextParams): Promise<InstagramSendTextResult> {
    const { tenantSlug, recipientId, text } = params;

    if (!tenantSlug) return { ok: false, error: 'InstagramSenderService: tenantSlug missing' };
    if (!recipientId) return { ok: false, error: 'InstagramSenderService: recipientId missing' };
    if (!text) return { ok: false, error: 'InstagramSenderService: text missing' };

    const prefix = tenantSlug.toUpperCase();

    const pageAccessToken = this.config.get<string>(`${prefix}_IG_PAGE_ACCESS_TOKEN`, '');
    if (!pageAccessToken) {
      return { ok: false, error: `InstagramSenderService: ${prefix}_IG_PAGE_ACCESS_TOKEN missing` };
    }

    const url = `${this.baseUrl}/${this.apiVersion}/me/messages`;

    this.logger.log(
      JSON.stringify({
        event: 'instagram_send_attempt',
        tenantSlug,
        recipientId,
        textLen: text.length,
        apiVersion: this.apiVersion,
      }),
      'InstagramSenderService',
    );

    try {
      const responseData = await this.requestWithRetry(async (signal) => {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          signal,
          body: JSON.stringify({
            recipient: { id: recipientId },
            message: { text },
            access_token: pageAccessToken,
          }),
        });

        const json = await res.json().catch(() => ({} as any));

        if (!res.ok) {
          const err: any = new Error(
            `Instagram send failed: ${res.status} - ${JSON.stringify(json)}`,
          );
          err.status = res.status;
          err.payload = json;
          throw err;
        }

        return json;
      }, { tenantSlug, recipientId });

      const messageId = responseData?.message_id;

      if (!messageId) {
        const errMsg = `Instagram send returned no message_id: ${JSON.stringify(responseData)}`;
        this.logger.error(
          JSON.stringify({
            event: 'instagram_send_unexpected_response',
            tenantSlug,
            recipientId,
            error: errMsg,
          }),
          '',
          'InstagramSenderService',
        );
        return { ok: false, error: errMsg };
      }

      this.logger.log(
        JSON.stringify({
          event: 'instagram_message_sent',
          tenantSlug,
          recipientId,
          messageId,
        }),
        'InstagramSenderService',
      );

      // ✅ CHANGE: success arm guarantees messageId
      return { ok: true, messageId };
    } catch (e: any) {
      const errMsg = e?.message ?? 'InstagramSenderService: unknown error';

      this.logger.error(
        JSON.stringify({
          event: 'instagram_send_exception',
          tenantSlug,
          recipientId,
          error: errMsg,
          status: e?.status,
        }),
        '',
        'InstagramSenderService',
      );

      // ✅ CHANGE: fail arm guarantees error
      return { ok: false, error: errMsg };
    }
  }

  // ====== internal helpers (additive, isolated) ======

  private async requestWithRetry<T>(
    fn: (signal: AbortSignal) => Promise<T>,
    meta: { tenantSlug: string; recipientId: string },
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
            event: 'instagram_http_ok',
            tenantSlug: meta.tenantSlug,
            recipientId: meta.recipientId,
            attempt,
            durationMs,
          }),
          'InstagramSenderService',
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
            event: 'instagram_http_fail',
            tenantSlug: meta.tenantSlug,
            recipientId: meta.recipientId,
            attempt,
            durationMs,
            isTimeout,
            status,
            retryable,
            error: err?.message,
          }),
          'InstagramSenderService',
        );

        if (!retryable || attempt >= this.maxAttempts) break;

        await this.sleep(this.computeBackoffMs(attempt));
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastErr ?? new Error('InstagramSenderService: request failed');
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
