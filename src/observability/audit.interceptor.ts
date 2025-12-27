import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
  import { catchError, tap } from 'rxjs/operators';

import { AuditLogService } from './audit-log.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const req = http.getRequest<any>();

    // If this isn't HTTP, do nothing.
    if (!req) return next.handle();

    const method = String(req.method ?? '').toUpperCase();
    const path = String(req.path ?? req.url ?? '');

    // ✅ Skip noise endpoints
    if (path.startsWith('/health')) {
      return next.handle();
    }

    // ✅ Only audit sensitive surfaces (Phase 4 DB+log)
    const shouldAudit =
      path.startsWith('/conversations') ||
      path.startsWith('/webhooks') ||
      path.startsWith('/test');

    if (!shouldAudit) {
      return next.handle();
    }

    const tenantSlug =
      String(req.params?.tenantSlug ?? req.headers?.['x-tenant'] ?? '')
        .trim()
        .toLowerCase() || undefined;

    const actor =
      req.headers?.['x-admin-key']
        ? 'admin_key'
        : req.headers?.['x-dev-key']
          ? 'dev_key'
          : 'anonymous';

    return next.handle().pipe(
      tap(async () => {
        await this.audit.write({
          event: 'http_request_ok',
          severity: 'info',
          tenantSlug,
          actor,

          // ✅ ADD: map to your existing AuditLogService contract
          actorType: actor,

          method,
          path,
          metadata: {
            status: 'ok',
          },
        });
      }),
      catchError((err) => {
        void this.audit.write({
          event: 'http_request_failed',
          severity: 'warn',
          tenantSlug,
          actor,

          // ✅ ADD: map to your existing AuditLogService contract
          actorType: actor,

          method,
          path,
          metadata: {
            error: String(err?.message ?? err ?? 'unknown_error').slice(0, 500),
          },
        });
        throw err;
      }),
    );
  }
}
