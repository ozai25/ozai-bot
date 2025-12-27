// src/queues/process-message.job.ts
import { randomUUID } from 'crypto';

export type SupportedInboundPlatform = 'whatsapp' | 'facebook' | 'instagram';

export interface ProcessMessageQueueJob {
  tenantSlug: string;
  platform: SupportedInboundPlatform;
  payload: any;
}

// ✅ ADD: canonical queue + job names to prevent string drift across modules
export const PROCESS_MESSAGE_QUEUE = 'process-message' as const;
export const PROCESS_MESSAGE_JOB = 'process-message' as const;

/**
 * ✅ Authoritative queue contract:
 * Job data MUST be { tenantSlug, platform, payload } because MessageProcessor normalizes payload.
 */
export function buildTestJob(tenantSlug: string): ProcessMessageQueueJob {
  const slug = String(tenantSlug || '').trim().toLowerCase() || 'sg01';

  // Minimal WhatsApp-ish payload (good enough for pipeline smoke tests)
  const waMessageId = randomUUID();
  const from = `user_${randomUUID()}`;

  const payload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: `waba_${randomUUID()}`,
        changes: [
          {
            field: 'messages',
            value: {
              messages: [
                {
                  id: waMessageId,
                  from,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: 'text',
                  text: { body: 'Hello OZ Backend — Phase 1 queue test.' },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  return {
    tenantSlug: slug,
    platform: 'whatsapp',
    payload,
  };
}
