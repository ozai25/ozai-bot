// src/security/pii-redactor.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PiiRedactorService {
  constructor(private readonly config: ConfigService) {}

  /**
   * Redacts sensitive patterns from text.
   * Backwards-compatible: tenantSlug is OPTIONAL.
   *
   * Controls:
   * - Global: PII_REDACTION_ENABLED=true/false (default true)
   * - Per-tenant: {TENANT}_PII_REDACTION_ENABLED=true/false (default = global)
   */
  redact(text: string, tenantSlug?: string): string {
    const input = String(text ?? '');
    if (!input) return input;

    // Toggle logic (safe defaults)
    const globalEnabled = this.toBool(this.config.get<string>('PII_REDACTION_ENABLED', 'true'));

    let enabled = globalEnabled;

    const slug = String(tenantSlug || '').trim().toLowerCase();
    if (slug) {
      const tenantKey = `${slug.toUpperCase()}_PII_REDACTION_ENABLED`;
      const tenantRaw = this.config.get<string>(tenantKey);
      if (tenantRaw != null && String(tenantRaw).trim() !== '') {
        enabled = this.toBool(String(tenantRaw));
      }
    }

    if (!enabled) return input;

    let out = input;

    // =========================
    // Redaction patterns
    // =========================

    // Credit cards (13–19 digits, allow spaces/dashes)
    // NOTE: This is a heuristic. We also apply a simple Luhn check to reduce false positives.
    out = out.replace(/(?:\b(?:\d[ -]*?){13,19}\b)/g, (m) => {
      const digits = m.replace(/[^\d]/g, '');
      if (digits.length < 13 || digits.length > 19) return m;
      if (!this.luhn(digits)) return m;
      return '[REDACTED_CC]';
    });

    // CVV (common formats)
    out = out.replace(/\b(?:cvv|cvc|security code)\s*[:=]?\s*\d{3,4}\b/gi, '[REDACTED_CVV]');

    // Emails
    out = out.replace(
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      '[REDACTED_EMAIL]',
    );

    // Password-like fields
    out = out.replace(
      /\b(password|passcode|pin)\s*[:=]\s*([^\s]{3,})\b/gi,
      (_m, key) => `${key}: [REDACTED]`,
    );

    // JWT tokens (very common leak)
    out = out.replace(
      /\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g,
      '[REDACTED_JWT]',
    );

    // Optional: Dominican/US phone-ish numbers (conservative)
    // You can remove this if you WANT phone numbers in alerts.
    out = out.replace(
      /\b(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/g,
      (m) => {
        // avoid nuking small numbers like "2025"
        const digits = m.replace(/[^\d]/g, '');
        if (digits.length < 10 || digits.length > 15) return m;
        return '[REDACTED_PHONE]';
      },
    );

    return out;
  }

  private toBool(v: any): boolean {
    const x = String(v ?? '').trim().toLowerCase();
    return x === '1' || x === 'true' || x === 'yes' || x === 'on';
  }

  // Luhn check to reduce false positives on credit card detection
  private luhn(num: string): boolean {
    let sum = 0;
    let alt = false;

    for (let i = num.length - 1; i >= 0; i--) {
      let n = num.charCodeAt(i) - 48;
      if (n < 0 || n > 9) return false;

      if (alt) {
        n *= 2;
        if (n > 9) n -= 9;
      }
      sum += n;
      alt = !alt;
    }

    return sum % 10 === 0;
  }
}
