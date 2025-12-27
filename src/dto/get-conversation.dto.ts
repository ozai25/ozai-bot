import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * DTO for retrieving a conversation within a tenant.
 * Used by ConversationsController GET endpoints.
 */
export class GetConversationDto {
  /**
   * Platform thread identifier.
   * This is the lookup key used in tenant schema.
   *
   * Examples:
   * - WhatsApp: phone number
   * - Instagram: thread ID
   * - Facebook: PSID
   */
  @Transform(({ value }) => String(value ?? '').trim())
  @IsString()
  @MinLength(2)
  @MaxLength(128)
  userIdentifier!: string;

  /**
   * Optional platform hint.
   * Used for debugging / future filtering only.
   */
  @IsOptional()
  @Transform(({ value }) => String(value ?? '').trim().toLowerCase())
  @IsString()
  @MaxLength(24)
  platform?: string;
}
