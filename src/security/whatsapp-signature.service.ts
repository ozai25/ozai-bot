import { Injectable } from '@nestjs/common';
import { createHmac } from 'crypto';
import { 
  SignatureVerificationService, 
  SignatureVerificationResult 
} from './signature-verification.service';
import { Tenant } from '../database/entities/core/tenant.entity';
import { LoggerService } from '../observability/logger.service';

@Injectable()
export class WhatsAppSignatureService extends SignatureVerificationService {
  constructor(private readonly logger: LoggerService) {
    super();
  }

  getSignatureHeaderName(): string {
    return 'x-hub-signature-256';
  }

  async verify(
    rawBody: Buffer,
    signature: string,
    tenant: Tenant,
  ): Promise<SignatureVerificationResult> {
    try {
      // Extract app secret from tenant config
      const appSecret = tenant.apiKeys?.whatsapp?.appSecret;

      if (!appSecret) {
        this.logger.error(
          `WhatsApp app secret not configured for tenant: ${tenant.slug}`,
          '',
          'WhatsAppSignatureService',
        );
        return {
          valid: false,
          reason: 'App secret not configured',
        };
      }

      // Signature format: "sha256=<hash>"
      if (!signature || !signature.startsWith('sha256=')) {
        return {
          valid: false,
          reason: 'Invalid signature format',
        };
      }

      const expectedSignature = signature.split('sha256=')[1];

      // Compute HMAC-SHA256
      const hmac = createHmac('sha256', appSecret);
      hmac.update(rawBody);
      const computedSignature = hmac.digest('hex');

      // Timing-safe comparison
      const isValid = this.timingSafeEqual(
        Buffer.from(expectedSignature),
        Buffer.from(computedSignature),
      );

      if (!isValid) {
        this.logger.warn(
          `Signature verification failed for tenant: ${tenant.slug}`,
          'WhatsAppSignatureService',
        );
      }

      return {
        valid: isValid,
        reason: isValid ? undefined : 'Signature mismatch',
      };
    } catch (error) {
      this.logger.error(
        `Signature verification error: ${error.message}`,
        error.stack,
        'WhatsAppSignatureService',
      );
      return {
        valid: false,
        reason: 'Verification error',
      };
    }
  }

  /**
   * Timing-safe comparison to prevent timing attacks
   */
  private timingSafeEqual(a: Buffer, b: Buffer): boolean {
    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a[i] ^ b[i];
    }

    return result === 0;
  }
}
