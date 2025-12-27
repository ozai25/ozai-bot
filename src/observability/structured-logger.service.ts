import {
  Injectable,
  LoggerService as NestLoggerService,
  Scope,
} from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

export interface LogContext {
  requestId?: string;
  tenantSlug?: string;
  conversationId?: string;
  userId?: string;
  [key: string]: any;
}

@Injectable({ scope: Scope.DEFAULT })
export class StructuredLoggerService implements NestLoggerService {
  private readonly asyncLocalStorage: AsyncLocalStorage<LogContext>;

  constructor() {
    this.asyncLocalStorage = new AsyncLocalStorage<LogContext>();
  }

  setContext(context: LogContext): void {
    const store = this.asyncLocalStorage.getStore();
    if (store) Object.assign(store, context);
  }

  getContext(): LogContext {
    return this.asyncLocalStorage.getStore() || {};
  }

  runWithContext<T>(context: LogContext, callback: () => T): T {
    return this.asyncLocalStorage.run(context, callback);
  }

  private formatMessage(level: string, message: any, context?: string): string {
    const ctx = this.getContext();
    const timestamp = new Date().toISOString();

    // CRITICAL: make indexable (strict-safe)
    const logObject: Record<string, any> = {
      timestamp,
      level,
      message: typeof message === 'string' ? message : JSON.stringify(message),
      context: context || 'Application',
      requestId: ctx.requestId,
      tenantSlug: ctx.tenantSlug,
      conversationId: ctx.conversationId,
      userId: ctx.userId,
      ...ctx,
    };

    for (const key of Object.keys(logObject)) {
      if (logObject[key] === undefined) delete logObject[key];
    }

    return JSON.stringify(logObject);
  }

  log(message: any, context?: string): void {
    console.log(this.formatMessage('info', message, context));
  }

  error(message: any, trace?: string, context?: string): void {
    console.error(this.formatMessage('error', message, context));
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
