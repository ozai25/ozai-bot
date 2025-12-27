import { Injectable } from '@nestjs/common';
import { Tenant } from '../database/entities/core/tenant.entity';

export interface SignatureVerificationResult {
  valid: boolean;
  reason?: string;
}

@Injectable()
export abstract class SignatureVerificationService {
  /**
   * Verify webhook signature
   * @param rawBody - Raw request body (Buffer)
   * @param signature - Signature from request header
   * @param tenant - Tenant entity with credentials
   */
  abstract verify(
    rawBody: Buffer,
    signature: string,
    tenant: Tenant,
  ): Promise<SignatureVerificationResult>;

  /**
   * Get signature header name for this platform
   */
  abstract getSignatureHeaderName(): string;
}
