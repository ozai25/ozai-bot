// src/telegram/telegram-webhook.controller.ts
import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Injectable,
  Optional,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { LoggerService } from '../observability/logger.service';
import { PiiRedactorService } from '../security/pii-redactor.service';
import { TelegramService } from './telegram.service';

type AnyRecord = Record<string, any>;

@Injectable()
class TelegramWebhookAuth {
  constructor(private readonly config: ConfigService) {}

  /**
   * Telegram supports a secret header:
   *   X-Telegram-Bot-Api-Secret-Token
   * We enforce it if configured.
   */
  assertAuthorized(headers: Record<string, any>) {
    const expected = String(
      this.config.get<string>('TELEGRAM_WEBHOOK_SECRET_TOKEN') ??
        process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN ??
        '',
    ).trim();

    const allowNoAuth =
      String(
        this.config.get<string>('TELEGRAM_WEBHOOK_ALLOW_NO_AUTH') ??
          process.env.TELEGRAM_WEBHOOK_ALLOW_NO_AUTH ??
          '',
      )
        .trim()
        .toLowerCase() === 'true';

    // If no secret is configured:
    // - allow in non-prod only if explicitly enabled
    // - block in prod always
    if (!expected) {
      if (process.env.NODE_ENV === 'production') {
        throw new UnauthorizedException('Unauthorized');
      }
      if (!allowNoAuth) {
        throw new UnauthorizedException('Unauthorized');
      }
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
}

@Controller('telegram')
export class TelegramWebhookController {
  constructor(
    private readonly config: ConfigService,
    private readonly logger: LoggerService,
    private readonly pii: PiiRedactorService,
    private readonly auth: TelegramWebhookAuth,

    // Optional: if TelegramService exists + is wired in TelegramModule,
    // this will forward updates for processing.
    @Optional() private readonly telegramService?: TelegramService,
  ) {}

  /**
   * Telegram webhook ingress.
   *
   * Recommended webhook URL:
   *   POST /telegram/webhook
   *
   * Security:
   * - If TELEGRAM_WEBHOOK_SECRET_TOKEN is set, we require the Telegram secret header.
   * - If not set:
   *   - production => blocked
   *   - non-prod => allowed only when TELEGRAM_WEBHOOK_ALLOW_NO_AUTH=true
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleTelegramWebhook(
    @Headers() headers: Record<string, any>,
    @Body() update: AnyRecord,
  ) {
    // ✅ auth gate
    this.auth.assertAuthorized(headers);

    // ✅ log safely (redact PII)
    const safeUpdate = this.safeRedactObject(update);

    this.logger.log(
      JSON.stringify({
        event: 'telegram_webhook_received',
        updateId: update?.update_id,
        keys: Object.keys(update ?? {}).slice(0, 25),
        preview: safeUpdate,
      }),
      'TelegramWebhookController',
    );

    // ✅ forward (if service is wired)
    if (this.telegramService && typeof (this.telegramService as any).handleUpdate === 'function') {
      await (this.telegramService as any).handleUpdate(update);
    }

    return { ok: true };
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
