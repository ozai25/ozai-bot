// src/alerts/telegram-admin-alert.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../observability/logger.service';

// ✅ ADD
import { PiiRedactorService } from '../security/pii-redactor.service';

export type AdminAlertSeverity = 'info' | 'warn' | 'critical';

@Injectable()
export class TelegramAdminAlertService {
  constructor(
    private readonly config: ConfigService,
    private readonly logger: LoggerService,

    // ✅ ADD
    private readonly pii: PiiRedactorService,
  ) {}

  async sendAdminAlert(input: {
    tenantSlug: string;
    title: string;
    lines: string[];
    severity: AdminAlertSeverity;
  }): Promise<void> {
    const tenantSlug = String(input.tenantSlug || '').trim().toLowerCase();
    if (!tenantSlug) return;

    const recipients = this.resolveRecipients(tenantSlug);

    // If nobody configured telegram at all, don’t throw — just log.
    if (recipients.length === 0) {
      this.logger.warn(
        JSON.stringify({
          event: 'telegram_admin_alert_skipped_no_recipients',
          tenantSlug,
          severity: input.severity,
          title: input.title,
        }),
        'TelegramAdminAlertService',
      );
      return;
    }

    // ✅ REDACT before formatting or sending
    const safeInput = {
      ...input,
      title: this.pii.redact(input.title),
      lines: (input.lines || []).map((l) => this.pii.redact(String(l ?? ''))),
    };

    const text = this.formatAlertText(safeInput);

    // Send to all recipients (tenant + optional hub)
    for (const chatId of recipients) {
      await this.safeSend(chatId, text, {
        tenantSlug,
        severity: input.severity,
        mode: chatId === this.getHubChatId() ? 'hub' : 'tenant',
      });
    }
  }

  // =========================
  // Recipient resolution (HUB)
  // =========================

  private resolveRecipients(tenantSlug: string): string[] {
    const out: string[] = [];

    // 1) Tenant chat id (preferred)
    const tenantChatId = this.getTenantChatId(tenantSlug);
    if (tenantChatId) out.push(tenantChatId);

    // 2) Optional global fallback (backwards compat)
    const globalFallback =
      this.cleanChatId(this.config.get<string>('TELEGRAM_OPS_CHAT_ID')) ||
      this.cleanChatId(this.config.get<string>('TELEGRAM_CHAT_ID'));
    if (!tenantChatId && globalFallback) out.push(globalFallback);

    // 3) Hub routing
    const hubEnabled = this.toBool(
      this.config.get<string>('ALERT_HUB_ENABLED', 'false'),
    );
    if (!hubEnabled) return this.dedupe(out);

    const hubTenant = String(this.config.get<string>('ALERT_HUB_TENANT', 'oz01'))
      .trim()
      .toLowerCase();

    const hubChatId = this.getHubChatId();
    if (!hubChatId) return this.dedupe(out);

    const perTenantForwardKey = `${tenantSlug.toUpperCase()}_ALERT_HUB_FORWARD`;
    const perTenantForward = this.toBool(
      this.config.get<string>(perTenantForwardKey, 'true'),
    );

    const allowlist = this.parseCsv(
      this.config.get<string>('ALERT_HUB_ALLOWLIST', ''),
    );
    const denylist = this.parseCsv(
      this.config.get<string>('ALERT_HUB_DENYLIST', ''),
    );

    const allowedByList =
      allowlist.length === 0 ? true : allowlist.includes(tenantSlug);
    const deniedByList = denylist.includes(tenantSlug);

    const shouldForwardToHub = perTenantForward && allowedByList && !deniedByList;
    const isHubTenant = tenantSlug === hubTenant;

    const modeRaw = String(this.config.get<string>('ALERT_HUB_MODE', 'mirror'))
      .trim()
      .toLowerCase();
    const mode: 'mirror' | 'hub_only' =
      modeRaw === 'hub_only' ? 'hub_only' : 'mirror';

    if (mode === 'hub_only') {
      return this.dedupe([hubChatId]);
    }

    if (shouldForwardToHub && !isHubTenant) {
      out.push(hubChatId);
    }

    return this.dedupe(out);
  }

  private getTenantChatId(tenantSlug: string): string {
    const prefix = tenantSlug.toUpperCase();
    return (
      this.cleanChatId(this.config.get<string>(`${prefix}_TELEGRAM_ADMIN_CHAT_ID`)) ||
      this.cleanChatId(this.config.get<string>(`${prefix}_TELEGRAM_OPS_CHAT_ID`)) ||
      ''
    );
  }

  private getHubChatId(): string {
    return this.cleanChatId(this.config.get<string>('ALERT_HUB_CHAT_ID')) || '';
  }

  // =========================
  // Telegram send (safe)
  // =========================

  private async safeSend(
    chatId: string,
    text: string,
    meta: {
      tenantSlug: string;
      severity: AdminAlertSeverity;
      mode: 'tenant' | 'hub';
    },
  ): Promise<void> {
    const token =
      this.config.get<string>('TELEGRAM_BOT_TOKEN') ||
      this.config.get<string>('TELEGRAM_TOKEN') ||
      '';

    if (!token) {
      this.logger.warn(
        JSON.stringify({
          event: 'telegram_admin_alert_missing_token',
          tenantSlug: meta.tenantSlug,
          severity: meta.severity,
          mode: meta.mode,
        }),
        'TelegramAdminAlertService',
      );
      return;
    }

    const url = `https://api.telegram.org/bot${encodeURIComponent(
      token,
    )}/sendMessage`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          disable_web_page_preview: true,
        }),
      });

      const bodyText = await res.text();

      if (!res.ok) {
        this.logger.error(
          JSON.stringify({
            event: 'telegram_admin_alert_send_failed',
            tenantSlug: meta.tenantSlug,
            severity: meta.severity,
            mode: meta.mode,
            chatId,
            status: res.status,
            response: bodyText.slice(0, 400),
          }),
          '',
          'TelegramAdminAlertService',
        );
        return;
      }

      this.logger.log(
        JSON.stringify({
          event: 'telegram_admin_alert_sent',
          tenantSlug: meta.tenantSlug,
          severity: meta.severity,
          mode: meta.mode,
          chatId,
        }),
        'TelegramAdminAlertService',
      );
    } catch (e: any) {
      this.logger.error(
        JSON.stringify({
          event: 'telegram_admin_alert_send_exception',
          tenantSlug: meta.tenantSlug,
          severity: meta.severity,
          mode: meta.mode,
          chatId,
          error: String(e?.message ?? e),
        }),
        '',
        'TelegramAdminAlertService',
      );
    }
  }

  private formatAlertText(input: {
    tenantSlug: string;
    title: string;
    lines: string[];
    severity: AdminAlertSeverity;
  }): string {
    const emoji =
      input.severity === 'critical'
        ? '🚨'
        : input.severity === 'warn'
          ? '⚠️'
          : 'ℹ️';

    const header = `${emoji} ${input.title}\nTenant: ${input.tenantSlug}`;

    const body = (input.lines || [])
      .map((l) => String(l || '').trim())
      .filter(Boolean)
      .slice(0, 25)
      .join('\n');

    return body ? `${header}\n\n${body}` : header;
  }

  private parseCsv(v: string | undefined | null): string[] {
    return String(v || '')
      .split(',')
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean);
  }

  private cleanChatId(v: string | undefined | null): string {
    const s = String(v || '').trim();
    return s ? s : '';
  }

  private toBool(v: any): boolean {
    const x = String(v ?? '').trim().toLowerCase();
    return x === '1' || x === 'true' || x === 'yes' || x === 'on';
  }

  private dedupe(arr: string[]): string[] {
    return Array.from(new Set(arr.filter(Boolean)));
  }
}
