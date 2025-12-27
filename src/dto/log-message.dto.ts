// src/dto/log-message.dto.ts
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'isPlainObject', async: false })
class IsPlainObjectConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (value == null) return true; // handled by @IsOptional
    if (typeof value !== 'object') return false;
    if (Array.isArray(value)) return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  defaultMessage(): string {
    return 'metadata must be a plain object';
  }
}

export class LogMessageDto {
  @Transform(({ value }) => String(value ?? '').trim())
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  userIdentifier!: string;

  @Transform(({ value }) => String(value ?? '').trim())
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  content!: string;

  // optional: defaults to "debug" in service/controller
  @IsOptional()
  @Transform(({ value }) => String(value ?? '').trim().toLowerCase())
  @IsString()
  @IsIn(['debug', 'facebook', 'instagram', 'whatsapp'])
  platform?: string;

  // optional: lets you group messages by a consistent thread id
  @IsOptional()
  @Transform(({ value }) => String(value ?? '').trim())
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  platformThreadId?: string;

  // optional: stored into conversation.metadata and message.metadata (redacted by your service)
  @IsOptional()
  @Validate(IsPlainObjectConstraint)
  @IsObject()
  metadata?: Record<string, any>;
}
