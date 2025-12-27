// src/platform/facebook-signature.util.ts
import crypto from 'crypto';

export type MetaSignatureVerifyResult =
  | { ok: true }
  | { ok: false; reason: string };

function timingSafeEqualHex(aHex: string, bHex: string): boolean {
  const a = Buffer.from(aHex, 'hex');
  const b = Buffer.from(bHex, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Meta (Facebook/Instagram) webhook signature verification.
 * Header: X-Hub-Signature-256: sha256=<hex>
 */
export function verifyFacebookSignature(params: {
  rawBody: Buffer;
  headerValue: string | undefined;
  appSecret: string | undefined;
}): MetaSignatureVerifyResult {
  const { rawBody, headerValue, appSecret } = params;

  const secret = String(appSecret ?? '').trim();
  if (!secret) return { ok: false, reason: 'missing_app_secret' };

  const header = String(headerValue ?? '').trim();
  if (!header) return { ok: false, reason: 'missing_signature_header' };

  // Expected format: "sha256=<hex>"
  const [algo, theirHex] = header.split('=');
  if (algo !== 'sha256' || !theirHex) return { ok: false, reason: 'bad_signature_format' };

  const oursHex = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  const ok = timingSafeEqualHex(oursHex, theirHex);
  return ok ? { ok: true } : { ok: false, reason: 'signature_mismatch' };
}
