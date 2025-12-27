// src/security/csrf.middleware.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';

import { LoggerService } from '../observability/logger.service';

@Injectable()
export class CsrfMiddleware {
  constructor(
    private readonly config: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    const enforce =
      String(this.config.get<string>('CSRF_ENFORCE') ?? '')
        .trim()
        .toLowerCase() === 'true';

    // Default posture: do nothing unless explicitly enabled.
    if (!enforce) {
      return next();
    }

    const method = String(req.method ?? '').toUpperCase();
    const path = String((req as any).path ?? req.url ?? '');

    // Allow safe methods.
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      return next();
    }

    // Never CSRF-block webhook endpoints (they are validated by signature/secret tokens).
    if (
      path.startsWith('/webhooks') ||
      path.startsWith('/whatsapp') ||
      path.startsWith('/telegram')
    ) {
      return next();
    }

    // Require an explicit CSRF token header when enforcement is on.
    const token = String(req.headers['x-csrf-token'] ?? '').trim();
    const expected = String(this.config.get<string>('CSRF_TOKEN') ?? '').trim();

    if (!expected) {
      this.logger.warn(
        'CSRF_ENFORCE is true but CSRF_TOKEN is not configured. Refusing unsafe request.',
        'CsrfMiddleware',
      );
      throw new UnauthorizedException('Unauthorized');
    }

    if (!token || token !== expected) {
      this.logger.warn('CSRF token validation failed.', 'CsrfMiddleware');
      throw new UnauthorizedException('Unauthorized');
    }

    return next();
  }
}
