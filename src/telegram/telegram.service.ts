// src/telegram/telegram.service.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { LoggerService } from '../observability/logger.service';

type TelegramUpdate = {
  update_id?: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

type TelegramMessage = {
  message_id?: number;
  date?: number;
  text?: string;
  caption?: string;
  chat?: TelegramChat;
  from?: TelegramUser;
};

type TelegramCallbackQuery = {
  id?: string;
  data?: string;
  from?: TelegramUser;
  message?: TelegramMessage;
};

type TelegramChat = {
  id?: number | string;
  type?: 'private' | 'group' | 'supergroup' | 'channel' | string;
  title?: string;
  username?: string;
};

type TelegramUser = {
  id?: number | string;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};

export type TelegramNormalizedInbound = {
  platform: 'telegram';
  userIdentifier: string; // stable: Telegram user id
  content: string;
  platformThreadId?: string; // chat id
  metadata?: Record<string, unknown>;
};

@Injectable()
export class TelegramService {
  constructor(
    private readonly config: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Hard feature-flag: telegram is "enabled" only if a bot token is configured.
   * (We do not call Telegram APIs here; we just refuse to treat inbound as valid without config.)
   */
  isEnabled(): boolean {
    const token = this.getBotToken();
    return Boolean(token);
  }

  /**
   * Zero-trust webhook verification.
   * Telegram supports a secret token header:
   *   X-Telegram-Bot-Api-Secret-Token
   *
   * If TELEGRAM_WEBHOOK_SECRET is set, we REQUIRE it to match.
   * If not set, we do not block (dev-friendly), but we log a warning.
   */
  verifySecretToken(headers: Record<string, any>): void {
    const expected = String(
      this.config.get<string>('TELEGRAM_WEBHOOK_SECRET') ?? '',
    ).trim();
    if (!expected) {
      // Dev-friendly default: allow, but log. For production, you should set TELEGRAM_WEBHOOK_SECRET.
      this.logger.warn(
        'Telegram webhook secret not configured (TELEGRAM_WEBHOOK_SECRET). Allowing request (dev-friendly).',
        'TelegramService',
      );
      return;
    }

    const got = String(
      headers?.['x-telegram-bot-api-secret-token'] ??
        headers?.['X-Telegram-Bot-Api-Secret-Token'] ??
        '',
    ).trim();

    if (!got || got !== expected) {
      throw new UnauthorizedException('Unauthorized');
    }
  }

  /**
   * Parse + normalize a Telegram update into our internal inbound shape.
   * Returns null for unsupported/noise updates (safe ignore).
   */
  normalizeUpdate(update: TelegramUpdate): TelegramNormalizedInbound | null {
    const msg =
      update?.message ??
      update?.edited_message ??
      update?.channel_post ??
      update?.edited_channel_post ??
      update?.callback_query?.message;

    const from = msg?.from ?? update?.callback_query?.from;
    const chat = msg?.chat;

    const text =
      this.safeText(msg?.text) ||
      this.safeText(msg?.caption) ||
      this.safeText(update?.callback_query?.data);

    // If we can’t extract a usable message, ignore safely.
    if (!from?.id || !text) {
      return null;
    }

    const userIdentifier = String(from.id).trim();
    const platformThreadId =
      chat?.id !== undefined ? String(chat.id).trim() : undefined;

    const metadata: Record<string, unknown> = {
      telegram: {
        update_id: update?.update_id ?? null,
        message_id: msg?.message_id ?? null,
        chat: chat
          ? {
              id: chat.id ?? null,
              type: chat.type ?? null,
              title: chat.title ?? null,
              username: chat.username ?? null,
            }
          : null,
        from: from
          ? {
              id: from.id ?? null,
              username: from.username ?? null,
              first_name: from.first_name ?? null,
              last_name: from.last_name ?? null,
              language_code: from.language_code ?? null,
              is_bot: from.is_bot ?? null,
            }
          : null,
      },
    };

    return {
      platform: 'telegram',
      userIdentifier,
      content: text,
      platformThreadId,
      metadata,
    };
  }

  /**
   * Convenience handler for your controller:
   * - verifies secret token (if configured)
   * - normalizes update
   * - returns a safe response shape for HTTP
   */
  handleWebhook(
    headers: Record<string, any>,
    body: unknown,
  ): { status: 'ok' | 'ignored'; normalized?: TelegramNormalizedInbound } {
    // Do not accept Telegram traffic unless token exists (prevents accidental public exposure).
    if (!this.isEnabled()) {
      this.logger.warn(
        'Telegram webhook hit but TELEGRAM_BOT_TOKEN not configured. Ignoring.',
        'TelegramService',
      );
      return { status: 'ignored' };
    }

    // Enforce secret token if configured.
    this.verifySecretToken(headers);

    const update = (body ?? {}) as TelegramUpdate;
    const normalized = this.normalizeUpdate(update);

    if (!normalized) {
      return { status: 'ignored' };
    }

    return { status: 'ok', normalized };
  }

  private getBotToken(): string {
    // Standard env name. (You can map additional names here later if needed.)
    return String(this.config.get<string>('TELEGRAM_BOT_TOKEN') ?? '').trim();
  }

  private safeText(v: unknown): string {
    const s = String(v ?? '').trim();
    if (!s) return '';
    // Basic safety: cap size to avoid log/DB abuse if someone spams a huge payload.
    return s.slice(0, 4000);
  }
}
