import { AiDecisionOutput } from '../contracts/ai-decision-output';

export type AiDecisionAdapterInput = {
  tenantSlug: string;
  platform: string;
  userText?: string;
  conversationId?: string;
  userIdentifier?: string;
};

export interface AiDecisionAdapter {
  decide(input: AiDecisionAdapterInput): Promise<AiDecisionOutput | null>;
}

// Injection token so we don’t hard-couple to a specific AI service name
export const AI_DECISION_ADAPTER = Symbol('AI_DECISION_ADAPTER');
