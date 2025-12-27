import { IsEnum, IsOptional, IsString, IsUUID, IsObject } from 'class-validator';

export enum MessagingPlatform {
  FACEBOOK = 'facebook',
  INSTAGRAM = 'instagram',
  WHATSAPP = 'whatsapp',
  TELEGRAM = 'telegram',
}

export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
  FILE = 'file',
  LOCATION = 'location',
  UNKNOWN = 'unknown',
}

export class NormalizedInboundMessageDto {
  @IsUUID()
  messageId: string;

  @IsEnum(MessagingPlatform)
  platform: MessagingPlatform;

  @IsString()
  tenantSlug: string;

  @IsString()
  platformThreadId: string; // conversation/thread ID from platform

  @IsString()
  senderPlatformId: string; // user PSID / WA number / TG user ID

  @IsOptional()
  @IsString()
  senderName?: string;

  @IsEnum(MessageType)
  messageType: MessageType;

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsObject()
  media?: {
    url?: string;
    mimeType?: string;
    caption?: string;
  };

  @IsOptional()
  @IsObject()
  location?: {
    latitude: number;
    longitude: number;
  };

  @IsOptional()
  @IsObject()
  rawPayload?: any; // full original webhook payload (for audits/debug)

  @IsString()
  receivedAt: string; // ISO timestamp
}
