// src/guards/admin.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<any>();
    const headers = (req?.headers ?? {}) as Record<string, any>;

    // ✅ Source-of-truth: ConfigService (loaded by ConfigModule/.env.local/.env)
    const expected = String(
      this.config.get<string>('ADMIN_API_KEY') ??
        this.config.get<string>('ADMIN_KEY') ??
        '',
    ).trim();

    // Express normalizes headers to lowercase
    const got = String(headers['x-admin-key'] ?? '').trim();

    if (!expected) {
      // No admin key configured => lock everything down.
      throw new UnauthorizedException('Unauthorized');
    }

    if (!got) {
      throw new UnauthorizedException('Unauthorized');
    }

    // ✅ Constant-time compare (prevents timing side-channel)
    const expectedBuf = Buffer.from(expected);
    const gotBuf = Buffer.from(got);

    // timingSafeEqual throws if lengths differ, so we hard-fail safely
    if (expectedBuf.length !== gotBuf.length) {
      throw new UnauthorizedException('Unauthorized');
    }

    if (!timingSafeEqual(expectedBuf, gotBuf)) {
      throw new UnauthorizedException('Unauthorized');
    }

    return true;
  }
}
