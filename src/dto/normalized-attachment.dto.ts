// src/dto/normalized-attachment.dto.ts
export type NormalizedAttachmentType =
  | 'image'
  | 'video'
  | 'audio'
  | 'file'
  | 'sticker'
  | 'location'
  | 'contact'
  | 'unknown';

export class NormalizedAttachmentDto {
  /**
   * Normalized type across all platforms.
   */
  type!: NormalizedAttachmentType;

  /**
   * Platform-native identifier (e.g., WhatsApp media id) if present.
   */
  platformAssetId?: string;

  /**
   * Resolved URL if your pipeline fetches one (optional).
   * Never assume this exists at ingest time.
   */
  url?: string;

  /**
   * Original filename if provided (optional).
   */
  filename?: string;

  /**
   * MIME type (optional).
   */
  mimeType?: string;

  /**
   * Size in bytes (optional).
   */
  sizeBytes?: number;

  /**
   * Any platform-specific metadata that you may want to store.
   * Keep it shallow; do not dump full webhook payloads here.
   */
  metadata?: Record<string, unknown>;
}
