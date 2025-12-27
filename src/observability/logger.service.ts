// src/observability/logger.service.ts
import { Injectable, LoggerService as NestLoggerService, Scope } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

// ✅ ADD
import { PiiRedactorService } from '../security/pii-redactor.service';

export interface LogContext {
  requestId?: string;
  tenantSlug?: string;
  conversationId?: string;
  userId?: string;
  [key: string]: any;
}

@Injectable({ scope: Scope.DEFAULT })
export class LoggerService implements NestLoggerService {
  private readonly asyncLocalStorage: AsyncLocalStorage<LogContext>;

  // ✅ ADD
  private readonly piiLogsEnabled: boolean;

  constructor(
    // ✅ ADD
    private readonly pii: PiiRedactorService,
  ) {
    this.asyncLocalStorage = new AsyncLocalStorage<LogContext>();

    // ✅ ADD: default ON (safe)
    const raw = String(process.env.PII_REDACTION_LOGS_ENABLED ?? 'true').trim().toLowerCase();
    this.piiLogsEnabled = raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
  }

  setContext(context: LogContext): void {
    const store = this.asyncLocalStorage.getStore();
    if (store) {
      Object.assign(store, context);
    }
  }

  getContext(): LogContext {
    return this.asyncLocalStorage.getStore() || {};
  }

  runWithContext<T>(context: LogContext, callback: () => T): T {
    return this.asyncLocalStorage.run(context, callback);
  }

  // =========================
  // ✅ ADD: Redaction helpers
  // =========================

  private safeToString(input: any): string {
    if (input == null) return '';
    if (typeof input === 'string') return input;

    try {
      return JSON.stringify(input);
    } catch {
      return String(input);
    }
  }

  private redactIfEnabled(text: string): string {
    if (!this.piiLogsEnabled) return text;

    // Hard guardrails: avoid logging massive payloads
    const capped = text.length > 5000 ? `${text.slice(0, 5000)}…[truncated]` : text;

    // Redact patterns (credit cards, ids, etc) using your central redactor
    return this.pii.redact(capped);
  }

  private formatMessage(level: string, message: any, context?: string): string {
    const ctx = this.getContext();
    const timestamp = new Date().toISOString();

    const rawMessage = this.safeToString(message);
    const safeMessage = this.redactIfEnabled(rawMessage);

    const logObject: Record<string, any> = {
      timestamp,
      level,
      message: safeMessage,
      context: context || 'Application',
      requestId: ctx.requestId,
      tenantSlug: ctx.tenantSlug,
      conversationId: ctx.conversationId,
      userId: ctx.userId,
      ...ctx,
    };

    Object.keys(logObject).forEach((key) => {
      if (logObject[key] === undefined) delete logObject[key];
    });

    // Redact the final JSON blob too (covers PII that sneaks in via ctx fields)
    const json = JSON.stringify(logObject);
    return this.redactIfEnabled(json);
  }

  log(message: any, context?: string): void {
    console.log(this.formatMessage('info', message, context));
  }

  error(message: any, trace?: string, context?: string): void {
    const errorLog = this.formatMessage('error', message, context);
    console.error(errorLog);
    if (trace) console.error(`Trace: ${trace}`);
  }

  warn(message: any, context?: string): void {
    console.warn(this.formatMessage('warn', message, context));
  }

  debug(message: any, context?: string): void {
    if (process.env.NODE_ENV === 'development') {
      console.debug(this.formatMessage('debug', message, context));
    }
  }

  verbose(message: any, context?: string): void {
    if (process.env.NODE_ENV === 'development') {
      console.log(this.formatMessage('verbose', message, context));
    }
  }
}
