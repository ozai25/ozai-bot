// src/security/admin-detection.middleware.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';

import { LoggerService } from '../observability/logger.service';

export type AdminDetection =
  | { kind: 'admin_key'; keyId?: string }
  | { kind: 'dev_key'; keyId?: string }
  | { kind: 'anonymous' };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      ozAuth?: AdminDetection;
    }
  }
}

@Injectable()
export class AdminDetectionMiddleware {
  constructor(
    private readonly config: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    const adminHeader =
      String(req.headers['x-admin-key'] ?? req.headers['X-Admin-Key'] ?? '')
        .trim()
        .toString();

    const devHeader =
      String(req.headers['x-dev-key'] ?? req.headers['X-Dev-Key'] ?? '')
        .trim()
        .toString();

    const expectedAdmin = String(
      this.config.get<string>('ADMIN_KEY') ?? '',
    ).trim();

    const expectedDev = String(this.config.get<string>('DEV_KEY') ?? '').trim();

    // Default: anonymous
    req.ozAuth = { kind: 'anonymous' };

    // If a key header is present but expected key is not configured, we refuse.
    if (adminHeader && !expectedAdmin) {
      this.logger.warn(
        'x-admin-key provided but ADMIN_KEY is not configured. Refusing request.',
        'AdminDetectionMiddleware',
      );
      throw new UnauthorizedException('Unauthorized');
    }

    if (devHeader && !expectedDev) {
      this.logger.warn(
        'x-dev-key provided but DEV_KEY is not configured. Refusing request.',
        'AdminDetectionMiddleware',
      );
      throw new UnauthorizedException('Unauthorized');
    }

    // Validate admin key
    if (adminHeader) {
      if (adminHeader === expectedAdmin) {
        req.ozAuth = { kind: 'admin_key' };
        return next();
      }
      this.logger.warn(
        'Invalid x-admin-key provided.',
        'AdminDetectionMiddleware',
      );
      throw new UnauthorizedException('Unauthorized');
    }

    // Validate dev key (lower privilege than admin)
    if (devHeader) {
      if (devHeader === expectedDev) {
        req.ozAuth = { kind: 'dev_key' };
        return next();
      }
      this.logger.warn('Invalid x-dev-key provided.', 'AdminDetectionMiddleware');
      throw new UnauthorizedException('Unauthorized');
    }

    return next();
  }
}
