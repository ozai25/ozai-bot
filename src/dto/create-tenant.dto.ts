// src/dto/create-tenant.dto.ts
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateTenantDto {
  /**
   * Tenant slug (also schema name in your multi-tenant setup).
   * Examples: "oz01", "sg01", "fp02"
   *
   * Strict rules to prevent injection or invalid schema identifiers.
   */
  @Transform(({ value }) => String(value ?? '').trim().toLowerCase())
  @IsString()
  @MinLength(2)
  @MaxLength(24)
  @Matches(/^[a-z][a-z0-9_]*$/, {
    message:
      'tenantSlug must start with a letter and contain only lowercase letters, numbers, and underscores',
  })
  tenantSlug!: string;

  /**
   * Human-friendly tenant name for admin UI / logs.
   */
  @Transform(({ value }) => String(value ?? '').trim())
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  name!: string;

  /**
   * Optional: mark tenant active/inactive at creation time.
   * Defaults should be handled in the service layer if omitted.
   */
  @IsOptional()
  @Transform(({ value }) => {
    const v = String(value ?? '').trim().toLowerCase();
    if (v === '') return undefined;
    if (v === 'true' || v === '1' || v === 'yes') return true;
    if (v === 'false' || v === '0' || v === 'no') return false;
    return value;
  })
  @IsBoolean()
  isActive?: boolean;
}
