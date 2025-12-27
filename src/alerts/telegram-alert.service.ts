import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { LoggerService } from '../observability/logger.service';

// ✅ ADD: keep as TYPE-ONLY so it does NOT emit a runtime require (undici is not installed)
import type { fetch as undiciFetch } from 'undici';

@Injectable()
export class TelegramAlertService {
  private readonly baseUrl = 'https://api.telegram.org';

  constructor(
    private readonly config: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  // ✅ ADD: safe fetch accessor (no hard dependency on undici)
  // If global fetch exists (Node 18+), use it.
  // If not, attempt lazy require('undici') only when needed.
  private getFetch(): typeof fetch {
    const f = (globalThis as any).fetch;
    if (typeof f === 'function') return f as typeof fetch;

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const undici = require('undici') as { fetch?: typeof fetch };
      if (typeof undici?.fetch === 'function') return undici.fetch as typeof fetch;
    } catch {
      // fallthrough
    }

    throw new Error(
      'Global fetch is not available and undici is not installed. Use Node 18+ or add undici dependency.',
    );
  }

  // ✅ ADD: Telegram message hard limit guard (Telegram max is ~4096 chars for text)
  private clampMessage(text: string): string {
    const t = String(text ?? '');
    if (t.length <= 3800) return t;
    return `${t.slice(0, 3800)}\n\n[TRUNCATED]`;
  }

  async sendAdminAlert(params: {
    tenantSlug: string;
    text: string;
  }): Promise<{ ok: boolean; error?: string }> {
    const { tenantSlug, text } = params;

    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN', '');
    if (!token) {
      const msg = 'TELEGRAM_BOT_TOKEN missing';
      this.logger.warn(
        JSON.stringify({ event: 'telegram_alert_skipped', tenantSlug, error: msg }),
        'TelegramAlertService',
      );
      return { ok: false, error: msg };
    }

    const prefix = tenantSlug?.toUpperCase?.() ?? '';
    const perTenantChatId = prefix
      ? this.config.get<string>(`${prefix}_TG_ADMIN_CHAT_ID`, '')
      : '';

    const chatId =
      perTenantChatId || this.config.get<string>('TELEGRAM_ADMIN_CHAT_ID', '');

    if (!chatId) {
      const msg = 'TELEGRAM_ADMIN_CHAT_ID missing (and no per-tenant override found)';
      this.logger.warn(
        JSON.stringify({ event: 'telegram_alert_skipped', tenantSlug, error: msg }),
        'TelegramAlertService',
      );
      return { ok: false, error: msg };
    }

    const url = `${this.baseUrl}/bot${token}/sendMessage`;

    // ✅ ADD: clamp outgoing message
    const safeText = this.clampMessage(text);

    try {
      const f = this.getFetch();

      const res = await f(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: safeText,
          disable_web_page_preview: true,

          // ✅ ADD: optional parse_mode (kept off by default)
          // parse_mode: 'Markdown',
        }),
      });

      const json: any = await res.json().catch(() => ({}));

      if (!res.ok || !json?.ok) {
        const errMsg = `Telegram send failed: ${res.status} - ${JSON.stringify(json)}`;
        this.logger.error(
          JSON.stringify({ event: 'telegram_alert_failed', tenantSlug, error: errMsg }),
          '',
          'TelegramAlertService',
        );
        return { ok: false, error: errMsg };
      }

      this.logger.log(
        JSON.stringify({
          event: 'telegram_alert_sent',
          tenantSlug,
          chatId,
          telegramMessageId: json?.result?.message_id,
        }),
        'TelegramAlertService',
      );

      return { ok: true };
    } catch (e: any) {
      const errMsg = e?.message ?? 'Telegram send exception';
      this.logger.error(
        JSON.stringify({ event: 'telegram_alert_exception', tenantSlug, error: errMsg }),
        '',
        'TelegramAlertService',
      );
      return { ok: false, error: errMsg };
    }
  }
}
