// src/config/app.config.ts
import { registerAs } from '@nestjs/config';

function toInt(value: unknown, fallback: number): number {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

function toBool(value: unknown, fallback = false): boolean {
  const v = String(value ?? '').trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return fallback;
}

function toStringArray(value: unknown): string[] {
  const s = String(value ?? '').trim();
  if (!s) return [];
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

export default registerAs('app', () => {
  const nodeEnv = String(process.env.NODE_ENV ?? 'development').trim() || 'development';

  // Support either ADMIN_API_KEY or ADMIN_KEY (your AdminGuard checks both).
  const adminApiKey =
    String(process.env.ADMIN_API_KEY ?? '').trim() || String(process.env.ADMIN_KEY ?? '').trim() || '';

  // Dev-only key (your DevOnlyGuard expects DEV_ONLY_KEY).
  const devOnlyKey = String(process.env.DEV_ONLY_KEY ?? '').trim() || '';

  const corsOrigin = String(process.env.CORS_ORIGIN ?? '*').trim() || '*';

  return {
    env: nodeEnv,
    isProd: nodeEnv === 'production',

    port: toInt(process.env.PORT, 3000),
    host: String(process.env.HOST ?? '0.0.0.0').trim() || '0.0.0.0',

    cors: {
      origin: corsOrigin,
      credentials: toBool(process.env.CORS_CREDENTIALS, true),
      methods: toStringArray(process.env.CORS_METHODS).length
        ? toStringArray(process.env.CORS_METHODS)
        : ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: toStringArray(process.env.CORS_ALLOWED_HEADERS).length
        ? toStringArray(process.env.CORS_ALLOWED_HEADERS)
        : [
            'Content-Type',
            'Authorization',
            'X-Request-Id',
            'x-hub-signature-256',
            'x-admin-key',
            'x-dev-key',
            'x-tenant',
          ],
    },

    security: {
      adminApiKey,
      devOnlyKey,
      devOnlyAllowLocalNoAuth: toBool(process.env.DEV_ONLY_ALLOW_LOCAL_NO_AUTH, false),
    },

    tenancy: {
      defaultTenantSlug: String(process.env.DEFAULT_TENANT_SLUG ?? 'oz01').trim().toLowerCase() || 'oz01',
    },

    observability: {
      logLevel: String(process.env.LOG_LEVEL ?? 'info').trim().toLowerCase() || 'info',
      redactPii: toBool(process.env.REDACT_PII, true),
    },
  };
});
