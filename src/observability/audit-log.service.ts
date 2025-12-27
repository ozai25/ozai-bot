import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import { AuditLog } from '../database/entities/core/audit-log.entity';
import { LoggerService } from './logger.service';
import { PiiRedactorService } from '../security/pii-redactor.service';

export type AuditActorType = 'admin_key' | 'dev_key' | 'platform_user' | 'system' | 'unknown';

export interface HttpAuditParams {
  requestId?: string | null;
  tenantSlug?: string | null;

  actorType?: AuditActorType | string | null;
  actorId?: string | null;

  method?: string | null;
  path?: string | null;

  statusCode?: number | null;
  durationMs?: number | null;

  ip?: string | null;
  userAgent?: string | null;

  metadata?: Record<string, any> | null;
  error?: string | null;

  // ✅ ADD: compat with AuditInterceptor payload
  event?: string | null;
  severity?: 'debug' | 'info' | 'warn' | 'error' | string | null;
  actor?: string | null;
}

/**
 * ✅ Phase 4: Persistent audit logging (core schema).
 * Hard requirements:
 * - Never throw (must not break request path).
 * - Redact before persisting.
 * - Keep payloads bounded.
 */
@Injectable()
export class AuditLogService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
    private readonly logger: LoggerService,
    private readonly pii: PiiRedactorService,
  ) {}

  /**
   * ✅ Back-compat alias (AuditInterceptor expects `write()`).
   * No behavior change: delegates to writeHttpAudit().
   */
  async write(input: HttpAuditParams): Promise<void> {
    await this.writeHttpAudit(input);
  }

  /**
   * Optional alias if any call-sites use fire-and-forget semantics.
   */
  writeAsync(input: HttpAuditParams): void {
    void this.writeHttpAudit(input);
  }

  async writeHttpAudit(input: HttpAuditParams): Promise<void> {
    try {
      const safe = this.sanitize(input);

      const row = this.repo.create({
        requestId: safe.requestId,
        tenantSlug: safe.tenantSlug,
        actorType: safe.actorType,
        actorId: safe.actorId,
        method: safe.method,
        path: safe.path,
        statusCode: safe.statusCode,
        durationMs: safe.durationMs,
        ip: safe.ip,
        userAgent: safe.userAgent,
        metadata: safe.metadata,
        error: safe.error,
      });

      await this.repo.save(row);
    } catch (e: any) {
      // Never break runtime. Log once with minimal info.
      this.logger.warn(
        JSON.stringify({
          event: 'audit_log_write_failed',
          error: String(e?.message ?? e ?? 'unknown_error'),
        }),
        'AuditLogService',
      );
    }
  }

  /**
   * Central sanitation: normalize + trim + redact + bound sizes.
   */
  private sanitize(input: HttpAuditParams): Required<HttpAuditParams> {
    const requestId = this.bound(String(input.requestId ?? '').trim(), 128) || null;

    const tenantSlug =
      this.bound(String(input.tenantSlug ?? '').trim().toLowerCase(), 32) || null;

    const actorTypeRaw = String(input.actorType ?? '').trim().toLowerCase();
    const actorType =
      (actorTypeRaw as AuditActorType) ||
      (actorTypeRaw ? actorTypeRaw : 'unknown');

    const actorId = this.bound(String(input.actorId ?? '').trim(), 255) || null;

    const method = this.bound(String(input.method ?? '').trim().toUpperCase(), 16) || null;
    const path = this.bound(String(input.path ?? '').trim(), 1024) || null;

    const statusCode =
      typeof input.statusCode === 'number' && Number.isFinite(input.statusCode)
        ? input.statusCode
        : null;

    const durationMs =
      typeof input.durationMs === 'number' && Number.isFinite(input.durationMs)
        ? Math.max(0, Math.floor(input.durationMs))
        : null;

    const ip = this.bound(String(input.ip ?? '').trim(), 128) || null;
    const userAgent = this.bound(String(input.userAgent ?? '').trim(), 512) || null;

    const error = this.bound(String(input.error ?? '').trim(), 1024) || null;

    // Redact metadata deeply and then bound serialized size.
    let metadata: Record<string, any> | null = null;
    if (input.metadata && typeof input.metadata === 'object') {
      try {
        const redacted = this.pii.redactObject(input.metadata);
        metadata = this.boundJson(redacted, 24_000);
      } catch {
        metadata = null;
      }
    }

    // ✅ ADD: capture interceptor fields without changing DB schema
    if (metadata && (input.event || input.severity || input.actor)) {
      metadata._audit = {
        event: input.event ?? null,
        severity: input.severity ?? null,
        actor: input.actor ?? null,
      };
    }

    return {
      requestId,
      tenantSlug,
      actorType,
      actorId,
      method,
      path,
      statusCode,
      durationMs,
      ip,
      userAgent,
      metadata,
      error,

      // ✅ ADD: required return fields (even if null)
      event: input.event ?? null,
      severity: input.severity ?? null,
      actor: input.actor ?? null,
    };
  }

  private bound(value: string, max: number): string {
    if (!value) return '';
    return value.length > max ? value.slice(0, max) : value;
  }

  /**
   * Ensures metadata is JSON-serializable and bounded by maxChars (post-stringify).
   */
  private boundJson(obj: any, maxChars: number): Record<string, any> | null {
    try {
      const s = JSON.stringify(obj);
      if (s.length <= maxChars) return obj as Record<string, any>;

      // If too large, store a truncated envelope (still redacted)
      return {
        _truncated: true,
        _maxChars: maxChars,
        preview: s.slice(0, maxChars),
      };
    } catch {
      return null;
    }
  }
}
