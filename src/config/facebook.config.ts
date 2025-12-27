// src/config/facebook.config.ts
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

export default registerAs('facebook', () => {
  const graphVersion = String(process.env.FACEBOOK_GRAPH_VERSION ?? 'v20.0').trim() || 'v20.0';

  return {
    graph: {
      baseUrl: String(process.env.FACEBOOK_GRAPH_BASE_URL ?? 'https://graph.facebook.com')
        .trim()
        .replace(/\/+$/, '') || 'https://graph.facebook.com',
      version: graphVersion,
      timeoutMs: toInt(process.env.FACEBOOK_HTTP_TIMEOUT_MS, 15_000),
    },

    webhook: {
      // Used for webhook verification handshake (hub.verify_token)
      verifyToken: String(process.env.FACEBOOK_VERIFY_TOKEN ?? '').trim() || '',
      // Used to validate incoming signatures if/when you enforce it for FB (X-Hub-Signature-256)
      appSecret: String(process.env.FACEBOOK_APP_SECRET ?? '').trim() || '',
      enforceSignature:
        toBool(process.env.FACEBOOK_ENFORCE_SIGNATURE, false) ||
        toBool(process.env.ENFORCE_FACEBOOK_SIGNATURE, false),
    },

    // Outbound sending (Page Inbox replies)
    page: {
      // Page Access Token for Send API
      accessToken: String(process.env.FACEBOOK_PAGE_ACCESS_TOKEN ?? process.env.FB_PAGE_ACCESS_TOKEN ?? '')
        .trim() || '',
      // Optional Page ID (not always required for Send API, but helpful for debugging/logging)
      pageId: String(process.env.FACEBOOK_PAGE_ID ?? process.env.FB_PAGE_ID ?? '').trim() || '',
    },

    // Retry/backoff behavior for sender service wrappers
    retry: {
      maxAttempts: toInt(process.env.FACEBOOK_SEND_MAX_ATTEMPTS, 3),
      backoffBaseMs: toInt(process.env.FACEBOOK_SEND_BACKOFF_BASE_MS, 500),
      backoffMaxMs: toInt(process.env.FACEBOOK_SEND_BACKOFF_MAX_MS, 10_000),
    },
  };
});
