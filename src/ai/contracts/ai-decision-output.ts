export type AiDecisionOutput = {
  intent?: string; // e.g. "human_handoff", "opt_out", "quote", etc.
  leadScore?: { score?: number; classification?: 'cold' | 'warm' | 'hot' | string };
  quote?: { urgency?: 'emergency' | 'same-day' | string; price?: number; serviceType?: string };
  appointment?: { confirmedSlot?: string };
  suggestedReply?: string;
};
