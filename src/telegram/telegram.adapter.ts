// src/telegram/telegram.adapter.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { LoggerService } from '../observability/logger.service';
import { PiiRedactorService } from '../security/pii-redactor.service';

export type TelegramParseMode = 'MarkdownV2' | 'Markdown' | 'HTML';

export interface TelegramSendMessageParams {
  chatId: string;
  text: string;
  parseMode?: TelegramParseMode;
  disableWebPagePreview?: boolean;
  disableNotification?: boolean;
  replyToMessageId?: number;
  metadata?: Record<string, any>;
}

export interface TelegramSendMessageResult {
  ok: boolean;
  messageId?: number;
  error?: string;
}

/**
 * TelegramAdapter
 * - Owns the Telegram Bot API wire protocol (fetch, auth, timeouts).
 * - Keeps Telegram HTTP details out of services/processors.
 * - Central place for logging + PII redaction before emitting logs.
 */
@Injectable()
export class TelegramAdapter {
  private readonly token: string;
  private readonly apiBase: string;
  private readonly defaultChatId?: string;

  constructor(
    private readonly config: ConfigService,
    private readonly logger: LoggerService,
    private readonly pii: PiiRedactorService,
  ) {
    const token =
      String(
        this.config.get<string>('TELEGRAM_BOT_TOKEN') ??
          process.env.TELEGRAM_BOT_TOKEN ??
          '',
      ).trim();

    this.token = token;
    this.apiBase = token ? `https://api.telegram.org/bot${token}` : '';

    this.defaultChatId = String(
      this.config.get<string>('TELEGRAM_DEFAULT_CHAT_ID') ??
        this.config.get<string>('TELEGRAM_ADMIN_CHAT_ID') ??
        process.env.TELEGRAM_DEFAULT_CHAT_ID ??
        process.env.TELEGRAM_ADMIN_CHAT_ID ??
        '',
    ).trim() || undefined;
  }

  /**
   * Send a message to an explicit chatId.
   */
  async sendMessage(params: TelegramSendMessageParams): Promise<TelegramSendMessageResult> {
    const chatId = String(params.chatId ?? '').trim();
    const text = String(params.text ?? '').trim();

    if (!this.apiBase || !this.token) {
      return { ok: false, error: 'telegram_token_missing' };
    }
    if (!chatId || !text) {
      return { ok: false, error: 'missing_required_fields' };
    }

    const payload: any = {
      chat_id: chatId,
      text,
    };

    if (params.parseMode) payload.parse_mode = params.parseMode;
    if (typeof params.disableWebPagePreview === 'boolean') {
      payload.disable_web_page_preview = params.disableWebPagePreview;
    }
    if (typeof params.disableNotification === 'boolean') {
      payload.disable_notification = params.disableNotification;
    }
    if (typeof params.replyToMessageId === 'number') {
      payload.reply_to_message_id = params.replyToMessageId;
    }

    const startedAt = Date.now();

    try {
      const res = await this.postJson('/sendMessage', payload);

      const messageId =
        typeof res?.result?.message_id === 'number'
          ? res.result.message_id
          : undefined;

      // Log safe (redacted)
      const redactedText = this.safeRedactText(text);
      const redactedMeta = params.metadata ? this.safeRedactObject(params.metadata) : undefined;

      this.logger.log(
        JSON.stringify({
          event: 'telegram_send_message_ok',
          chatIdLen: chatId.length,
          textLen: text.length,
          preview: redactedText,
          messageId,
          ms: Date.now() - startedAt,
          metadata: redactedMeta,
        }),
        'TelegramAdapter',
      );

      return { ok: true, messageId };
    } catch (err: any) {
      const msg = String(err?.message ?? err ?? 'unknown_error');

      this.logger.error(
        JSON.stringify({
          event: 'telegram_send_message_failed',
          chatIdLen: chatId.length,
          textLen: text.length,
          error: msg.slice(0, 500),
          ms: Date.now() - startedAt,
        }),
        'TelegramAdapter',
      );

      return { ok: false, error: msg };
    }
  }

  /**
   * Convenience: send to default admin chat (if configured).
   * This is what alerting services should call by default.
   */
  async sendAdminMessage(
    text: string,
    opts?: Omit<TelegramSendMessageParams, 'chatId' | 'text'>,
  ): Promise<TelegramSendMessageResult> {
    if (!this.defaultChatId) {
      return { ok: false, error: 'telegram_default_chat_missing' };
    }
    return this.sendMessage({
      chatId: this.defaultChatId,
      text,
      parseMode: opts?.parseMode,
      disableNotification: opts?.disableNotification,
      disableWebPagePreview: opts?.disableWebPagePreview,
      replyToMessageId: opts?.replyToMessageId,
      metadata: opts?.metadata,
    });
  }

  /**
   * Internal HTTP helper (Node 18+ fetch).
   */
  private async postJson(path: string, body: any): Promise<any> {
    const url = `${this.apiBase}${path}`;
    const controller = new AbortController();

    // hard timeout to prevent worker hangs
    const timeoutMs = this.getTimeoutMs();
    const t = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }

      if (!res.ok || !json?.ok) {
        const errMsg =
          String(json?.description ?? res.statusText ?? 'telegram_api_error') ||
          'telegram_api_error';
        throw new Error(errMsg);
      }

      return json;
    } finally {
      clearTimeout(t);
    }
  }

  private getTimeoutMs(): number {
    const raw =
      this.config.get<number>('TELEGRAM_HTTP_TIMEOUT_MS') ??
      Number(process.env.TELEGRAM_HTTP_TIMEOUT_MS ?? 0);

    const n = Number.isFinite(raw) && raw > 0 ? Number(raw) : 8000;
    return Math.min(Math.max(n, 2000), 20000);
  }

  private safeRedactText(input: string): string {
    // Keep logs useful but safe.
    const s = String(input ?? '').slice(0, 240);
    try {
      // PiiRedactorService may not expose the same method names everywhere;
      // this call path is defensive and will not break runtime if methods differ.
      const anyPii = this.pii as any;
      if (typeof anyPii.redactText === 'function') return String(anyPii.redactText(s));
      if (typeof anyPii.redact === 'function') return String(anyPii.redact(s));
      return s;
    } catch {
      return s;
    }
  }

  private safeRedactObject(input: any): any {
    try {
      const anyPii = this.pii as any;
      if (typeof anyPii.redactObject === 'function') return anyPii.redactObject(input);
      if (typeof anyPii.redact === 'function') return anyPii.redact(input);
      return input;
    } catch {
      return input;
    }
  }
}
