// src/observability/logging.interceptor.ts
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

import { LoggerService } from './logger.service';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: LoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const req = http.getRequest<any>();

    if (!req) {
      return next.handle();
    }

    const method = String(req.method ?? 'UNKNOWN');
    const path = String(req.originalUrl ?? req.url ?? '/');
    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - start;
        // LoggerService in this repo does not expose `.info()`
        this.logger.log(`${method} ${path} ${duration}ms`, 'HTTP');
      }),
    );
  }
}
