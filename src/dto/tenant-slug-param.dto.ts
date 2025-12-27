import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * Route param validator for tenant scoping.
 * Supports your current tenant slugs: sg01, fp02, oz01
 */
export class TenantSlugParamDto {
  @Transform(({ value }) => String(value ?? '').trim().toLowerCase())
  @IsString()
  @MinLength(4)
  @MaxLength(12)
  @Matches(/^[a-z]{2,6}[0-9]{2,4}$/, {
    message: 'tenantSlug must look like sg01 / fp02 / oz01',
  })
  tenantSlug!: string;
}
