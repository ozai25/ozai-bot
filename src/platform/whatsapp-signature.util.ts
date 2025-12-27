// src/platform/whatsapp-signature.util.ts
import { MetaSignatureVerifyResult, verifyFacebookSignature } from './facebook-signature.util';

/**
 * WhatsApp Cloud API uses Meta webhook signature verification:
 * X-Hub-Signature-256: sha256=<hex>
 */
export function verifyWhatsAppSignature(params: {
  rawBody: Buffer;
  headerValue: string | undefined;
  appSecret: string | undefined;
}): MetaSignatureVerifyResult {
  return verifyFacebookSignature(params);
}
