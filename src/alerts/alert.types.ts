export type EscalationReason =
  | 'hot_lead'
  | 'human_handoff'
  | 'appointment_confirmed'
  | 'quote_ready';

export interface EscalationPayload {
  tenantSlug: string;
  platform: 'facebook' | 'instagram' | 'whatsapp';
  conversationId?: string;
  platformThreadId?: string;
  userIdentifier?: string; // senderPlatformId / PSID / WA number
  lastUserText?: string;

  // optional enrichment
  leadScore?: number;
  leadSignals?: any;

  quote?: {
    serviceType?: string;
    urgency?: string;
    squareFootage?: number;
    price?: number;
    currency?: string;
  };

  appointment?: {
    pending?: boolean;
    confirmed?: boolean;
    confirmedSlot?: string;
  };
}
