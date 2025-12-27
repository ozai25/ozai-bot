// src/config/security.config.ts
import { registerAs } from '@nestjs/config';

function toBool(value: unknown, fallback = false): boolean {
  const v = String(value ?? '').trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return fallback;
}

function toInt(value: unknown, fallback: number): number {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

export default registerAs('security', () => {
  const nodeEnv = String(process.env.NODE_ENV ?? 'development').trim().toLowerCase() || 'development';
  const isProd = nodeEnv === 'production';

  return {
    env: {
      nodeEnv,
      isProd,
    },

    // Used by AdminGuard (x-admin-key)
    admin: {
      apiKey: String(process.env.ADMIN_API_KEY ?? process.env.ADMIN_KEY ?? '').trim() || '',
      headerName: 'x-admin-key',
    },

    // Used by DevOnlyGuard (x-dev-key or x-admin-key fallback)
    devOnly: {
      key: String(process.env.DEV_ONLY_KEY ?? '').trim() || '',
      allowLocalNoAuth: toBool(process.env.DEV_ONLY_ALLOW_LOCAL_NO_AUTH, false),
      headerNames: ['x-dev-key', 'x-admin-key'],
      hardBlockInProd: true,
    },

    // WhatsApp signature verification behavior (matches your existing pattern)
    whatsapp: {
      appSecret: String(process.env.WHATSAPP_APP_SECRET ?? '').trim() || '',
      // In non-prod you already support bypassing signature checks
      devBypassSignature: toBool(process.env.WHATSAPP_DEV_BYPASS_SIGNATURE, !isProd),
      signatureHeader: 'x-hub-signature-256',
    },

    // Optional toggles if you later enforce signatures for FB/IG webhooks at the guard/service level
    facebook: {
      appSecret: String(process.env.FACEBOOK_APP_SECRET ?? '').trim() || '',
      enforceSignature: toBool(process.env.FACEBOOK_ENFORCE_SIGNATURE ?? process.env.ENFORCE_FACEBOOK_SIGNATURE, false),
      signatureHeader: 'x-hub-signature-256',
    },

    instagram: {
      appSecret: String(process.env.INSTAGRAM_APP_SECRET ?? '').trim() || '',
      enforceSignature: toBool(process.env.INSTAGRAM_ENFORCE_SIGNATURE ?? process.env.ENFORCE_INSTAGRAM_SIGNATURE, false),
      signatureHeader: 'x-hub-signature-256',
    },

    // Lightweight request safety knobs (safe defaults; used if/when you wire them)
    request: {
      maxBodyBytes: toInt(process.env.MAX_BODY_BYTES, 1_000_000), // 1MB default
      trustProxy: toBool(process.env.TRUST_PROXY, false),
    },

    // PII redaction controls (AuditLog + Logger can reference this)
    pii: {
      enabled: toBool(process.env.PII_REDACTION_ENABLED, true),
      // Comma-separated allowlist/denylist patterns if you want later
      extraKeysCsv: String(process.env.PII_EXTRA_KEYS ?? '').trim(),
    },
  };
});
