// src/platform/instagram-signature.util.ts
import { MetaSignatureVerifyResult, verifyFacebookSignature } from './facebook-signature.util';

/**
 * Instagram webhooks use the same Meta signature mechanism as Facebook.
 * Kept separate for platform clarity and future divergence.
 */
export function verifyInstagramSignature(params: {
  rawBody: Buffer;
  headerValue: string | undefined;
  appSecret: string | undefined;
}): MetaSignatureVerifyResult {
  return verifyFacebookSignature(params);
}
