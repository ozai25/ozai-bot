// src/filters/global-exception.filter.ts
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

type HttpExceptionResponseLike =
  | string
  | {
      message?: string | string[];
      error?: string;
      statusCode?: number;
    }
  | Record<string, unknown>;

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<any>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();

      const response = exception.getResponse() as HttpExceptionResponseLike;

      const extracted = this.extractMessage(response);
      if (extracted) message = extracted;
    }

    res.status(status).json({
      statusCode: status,
      error: message,
      timestamp: new Date().toISOString(),
    });
  }

  private extractMessage(response: HttpExceptionResponseLike): string | null {
    if (typeof response === 'string') return response;

    if (response && typeof response === 'object') {
      const msg = (response as { message?: unknown }).message;

      if (typeof msg === 'string' && msg.trim()) return msg.trim();

      if (Array.isArray(msg)) {
        const parts = msg
          .map((x) => (typeof x === 'string' ? x.trim() : ''))
          .filter(Boolean);
        if (parts.length) return parts.join('; ');
      }

      const err = (response as { error?: unknown }).error;
      if (typeof err === 'string' && err.trim()) return err.trim();
    }

    return null;
  }
}
