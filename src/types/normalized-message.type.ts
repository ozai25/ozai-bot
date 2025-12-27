// src/types/normalized-message.type.ts

/**
 * Canonical platform identifiers used across the pipeline.
 * Keep values stable — they become persisted/audited fields and queue payloads.
 */
export enum MessagingPlatform {
  WHATSAPP = 'whatsapp',
  FACEBOOK = 'facebook',
  INSTAGRAM = 'instagram',
  TELEGRAM = 'telegram',
}

/**
 * Canonical message types. This prevents "stringly typed" logic in processors.
 */
export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  AUDIO = 'audio',
  VIDEO = 'video',
  DOCUMENT = 'document',
  LOCATION = 'location',
  CONTACT = 'contact',
  STICKER = 'sticker',
  REACTION = 'reaction',
  UNKNOWN = 'unknown',
}

/**
 * Optional attachment payload when the inbound message carries media.
 * Keep this intentionally minimal and platform-agnostic.
 */
export interface NormalizedAttachment {
  type: MessageType;
  url?: string; // if you have a resolvable URL
  mimeType?: string;
  fileName?: string;
  sizeBytes?: number;
  caption?: string;
  sha256?: string;
  metadata?: Record<string, any>;
}

/**
 * The canonical inbound message contract that all adapters must emit.
 * This is what gets queued and processed (AI, automation, persistence).
 */
export interface NormalizedInboundMessage {
  tenantSlug: string;

  platform: MessagingPlatform;

  messageType: MessageType;

  /**
   * Platform user identifier of the sender (PSID / WA phone id / IG id etc.)
   */
  from: string;

  /**
   * Optional: platform recipient identifier (page id / phone number id / etc.)
   */
  to?: string;

  /**
   * Canonical body text (already trimmed if possible).
   * For non-text types, you may set empty string and rely on attachments.
   */
  text: string;

  /**
   * Platform message id for dedupe/tracing.
   */
  platformMessageId?: string;

  /**
   * Thread / conversation id when the platform provides one.
   */
  platformThreadId?: string;

  /**
   * When the message was received (ISO string). If unknown, set now().
   */
  receivedAtIso: string;

  /**
   * Optional attachments (image/audio/doc/etc.).
   */
  attachments?: NormalizedAttachment[];

  /**
   * Optional: raw platform payload for debug/audit. Avoid storing PII here long-term.
   */
  raw?: Record<string, any>;

  /**
   * Optional: additional metadata from adapters (safe + small).
   */
  metadata?: Record<string, any>;
}

/**
 * Canonical outbound message contract used by the outbound queue.
 * Keep aligned with your send-message job data.
 */
export interface NormalizedOutboundMessage {
  tenantSlug: string;
  platform: MessagingPlatform;
  recipientId: string;
  text: string;
  metadata?: Record<string, any>;
}
