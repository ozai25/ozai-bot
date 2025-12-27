// src/dto/process-message-job.dto.ts
import { Type, Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';

import { NormalizedInboundMessageDto } from './normalized-inbound-message.dto';

export class ProcessMessageJobDto {
  @Transform(({ value }) => String(value ?? '').trim().toLowerCase())
  @IsString()
  @MinLength(2)
  @MaxLength(32)
  tenantSlug!: string;

  @ValidateNested()
  @Type(() => NormalizedInboundMessageDto)
  inbound!: NormalizedInboundMessageDto;
}
