import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

// ✅ ADD
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DevOnlyGuard implements CanActivate {
  // ✅ ADD
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    // ✅ CHANGE: read from ConfigService (guarantees .env.local/.env via ConfigModule)
    const nodeEnv = String(this.config.get<string>('NODE_ENV') ?? process.env.NODE_ENV ?? '')
      .trim()
      .toLowerCase();

    // Hard block in production, no exceptions.
    if (nodeEnv === 'production') {
      throw new UnauthorizedException('Unauthorized');
    }

    const req = context.switchToHttp().getRequest<any>();
    const headers = (req?.headers ?? {}) as Record<string, any>;

    // ✅ CHANGE: config-backed flag (still falls back to process.env)
    const allowLocalNoAuthRaw = String(
      this.config.get<string>('DEV_ONLY_ALLOW_LOCAL_NO_AUTH') ??
        process.env.DEV_ONLY_ALLOW_LOCAL_NO_AUTH ??
        '',
    )
      .trim()
      .toLowerCase();

    const allowLocalNoAuth = allowLocalNoAuthRaw === 'true';

    const ip = String(headers['x-forwarded-for'] || req?.ip || req?.socket?.remoteAddress || '')
      .trim()
      .toLowerCase();

    const isLocal = ip.includes('127.0.0.1') || ip.includes('::1') || ip.includes('localhost');

    if (allowLocalNoAuth && isLocal) {
      return true;
    }

    // ✅ CHANGE: expected key from ConfigService (guarantees it exists if env is loaded)
    const expected = String(
      this.config.get<string>('DEV_ONLY_KEY') ?? process.env.DEV_ONLY_KEY ?? '',
    ).trim();

    const got = String(headers['x-dev-key'] ?? headers['x-admin-key'] ?? '').trim();

    if (!expected) {
      // If you didn’t configure a key, block. This prevents accidental exposure.
      throw new UnauthorizedException('Unauthorized');
    }

    if (!got || got !== expected) {
      throw new UnauthorizedException('Unauthorized');
    }

    return true;
  }
}
