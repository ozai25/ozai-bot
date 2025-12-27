import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

/**
 * AdminThrottlerGuard (NO-OP)
 *
 * We do NOT implement a second throttler guard here.
 * Reason: @nestjs/throttler versions differ, and custom guard constructor signatures
 * can break DI at boot (as observed).
 *
 * Admin throttling is enforced via:
 *  - Global ThrottlerGuard provided in RateLimitModule (APP_GUARD)
 *  - Controller-level @Throttle({ admin: { ttl, limit } }) where needed
 *
 * Keeping this file as a no-op prevents boot crashes if it is referenced anywhere,
 * while preserving your "do not delete lines / do not remove files" discipline.
 *
 * ✅ ADD (IMPORTANT CLARIFICATION):
 * - This guard does NOT perform throttling.
 * - DO NOT rely on @UseGuards(AdminThrottlerGuard) for rate limiting.
 * - Rate limiting is enforced by the global ThrottlerGuard + @Throttle metadata.
 */
@Injectable()
export class AdminThrottlerGuard implements CanActivate {
  // ✅ ADD: Explicitly document intent at runtime if someone debugs guards
  // eslint-disable-next-line class-methods-use-this
  canActivate(_context: ExecutionContext): boolean {
    return true;
  }
}
