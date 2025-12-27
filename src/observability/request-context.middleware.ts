import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { LoggerService } from './logger.service';
import { randomUUID } from 'crypto';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly logger: LoggerService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = req.headers['x-request-id'] as string || randomUUID();
    
    // Extract tenantSlug from URL (e.g., /webhooks/whatsapp/sg01)
    const tenantSlugMatch = req.path.match(/\/webhooks\/[^/]+\/([^/]+)/);
    const tenantSlug = tenantSlugMatch ? tenantSlugMatch[1] : undefined;

    // Store context in async local storage
    this.logger.runWithContext(
      { requestId, tenantSlug },
      () => {
        // Attach to request object for easy access
        req['requestId'] = requestId;
        req['tenantSlug'] = tenantSlug;

        // Add requestId to response headers for tracing
        res.setHeader('X-Request-Id', requestId);

        this.logger.log(
          `Incoming ${req.method} ${req.path}`,
          'RequestContextMiddleware',
        );

        next();
      },
    );
  }
}
