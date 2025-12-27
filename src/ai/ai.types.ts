// src/ai/ai.types.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * AI TYPES (AUTHORITATIVE)
 * - Zero imports (prevents circular deps)
 * - Strict + narrow contracts (prevents hidden shape drift)
 * - Safe defaults for multi-tenant + multi-platform backend
 */

/**
 * Supported AI provider names (extend as needed).
 */
export type AiProvider = 'openai' | 'mock' | 'disabled';

/**
 * Minimal role set for chat-style models.
 */
export type AiRole = 'system' | 'developer' | 'user' | 'assistant' | 'tool';

/**
 * Minimal message shape.
 * Note: keep `content` as string to avoid mixed content bugs across providers.
 */
export interface AiMessage {
  role: AiRole;
  content: string;

  /**
   * Optional metadata for observability/debugging (never sent to providers unless you explicitly map it).
   */
  meta?: Record<string, any>;
}

/**
 * Optional per-tenant runtime controls.
 * Use this to keep knobs bounded and explicit.
 */
export interface AiRuntimeOptions {
  temperature?: number; // 0.0 - 2.0 (provider-specific)
  topP?: number; // 0.0 - 1.0
  maxOutputTokens?: number; // provider-specific
  presencePenalty?: number; // -2.0 - 2.0
  frequencyPenalty?: number; // -2.0 - 2.0
  seed?: number;
  stop?: string[]; // explicit stop sequences
}

/**
 * High-level model identifier.
 * Keep as string so you can use tenant-configured model names without touching types.
 */
export type AiModel = string;

/**
 * A single AI call request (chat completion style).
 */
export interface AiChatRequest {
  /**
   * REQUIRED: tenant context for multi-tenant safety.
   */
  tenantSlug: string;

  /**
   * REQUIRED: provider + model are explicit so routing is deterministic.
   */
  provider: AiProvider;
  model: AiModel;

  /**
   * REQUIRED: prompt messages (system/developer/user/etc).
   */
  messages: AiMessage[];

  /**
   * OPTIONAL: deterministic tracing/correlation.
   */
  requestId?: string;

  /**
   * OPTIONAL: additional bounded controls for generation.
   */
  options?: AiRuntimeOptions;

  /**
   * OPTIONAL: caller-provided tags (not sent upstream unless you map).
   */
  tags?: string[];

  /**
   * OPTIONAL: structured context (not sent upstream unless you map).
   * This is where you can place normalized inbound info, tenant config, etc.
   */
  context?: Record<string, any>;
}

/**
 * Token usage (provider-agnostic).
 */
export interface AiUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

/**
 * Unified AI response.
 */
export interface AiChatResponse {
  ok: true;

  /**
   * Provider identifiers for debugging and analytics.
   */
  provider: AiProvider;
  model: AiModel;

  /**
   * The assistant output text. Keep single string as canonical.
   */
  text: string;

  /**
   * Optional raw provider payload (store sparingly; redact before persisting).
   */
  raw?: any;

  /**
   * Token usage if available.
   */
  usage?: AiUsage;

  /**
   * Correlation.
   */
  requestId?: string;

  /**
   * Latency if measured by caller.
   */
  latencyMs?: number;
}

/**
 * Unified AI error response.
 */
export interface AiChatError {
  ok: false;

  provider: AiProvider;
  model: AiModel;

  /**
   * Short machine-friendly code (e.g. rate_limit, timeout, bad_request).
   */
  code: string;

  /**
   * Human readable message (safe to log; no secrets).
   */
  message: string;

  /**
   * Optional details (never expose to clients unless redacted).
   */
  details?: any;

  requestId?: string;
}

/**
 * Convenience union.
 */
export type AiChatResult = AiChatResponse | AiChatError;

/**
 * Intent classification output (optional downstream use).
 * Keep narrow. Expand only when you have a stable contract.
 */
export type AiIntent =
  | 'support'
  | 'sales'
  | 'booking'
  | 'faq'
  | 'handoff'
  | 'unknown';

/**
 * Minimal decision contract (optional).
 * Use when you want the AI layer to return both text + an action hint.
 */
export interface AiDecision {
  intent: AiIntent;

  /**
   * Confidence 0-1, caller decides thresholds.
   */
  confidence?: number;

  /**
   * Optional extracted entities (bounded by caller).
   */
  entities?: Record<string, any>;
}

/**
 * AI output that includes both a reply and an optional decision artifact.
 */
export interface AiReply {
  text: string;
  decision?: AiDecision;

  /**
   * Optional “should we escalate” signal without hardwiring alerts into AI layer.
   */
  escalate?: boolean;

  /**
   * Optional escalation reason (bounded).
   */
  escalateReason?: string;
}

/**
 * When you want a strictly typed "generate reply" request separate from low-level chat request.
 * This aligns well with your processors: MessageProcessor -> AiService -> OutboundProducer.
 */
export interface GenerateReplyInput {
  tenantSlug: string;

  /**
   * Canonical platform string for routing rules.
   * Keep it consistent with your queue contract: 'whatsapp' | 'facebook' | 'instagram'
   */
  platform: 'whatsapp' | 'facebook' | 'instagram';

  /**
   * Conversation identifiers for state.
   */
  platformThreadId?: string;
  userIdentifier: string;
  userName?: string;

  /**
   * The inbound text (already normalized upstream).
   */
  inboundText: string;

  /**
   * Optional previous messages (caller supplies trimmed window).
   */
  history?: Array<{
    role: 'user' | 'assistant';
    content: string;
    at?: string; // ISO
  }>;

  /**
   * Optional feature flags / policy toggles (caller-controlled).
   */
  flags?: Record<string, any>;

  /**
   * Optional structured context (tenant config, lead score, etc.)
   */
  context?: Record<string, any>;
}

/**
 * Typed output for GenerateReply.
 */
export interface GenerateReplyOutput {
  ok: true;
  reply: AiReply;

  /**
   * For analytics/debug.
   */
  provider?: AiProvider;
  model?: AiModel;
  usage?: AiUsage;
  requestId?: string;
  latencyMs?: number;
}

/**
 * Error output for GenerateReply.
 */
export interface GenerateReplyError {
  ok: false;
  code: string;
  message: string;
  details?: any;

  provider?: AiProvider;
  model?: AiModel;
  requestId?: string;
}

export type GenerateReplyResult = GenerateReplyOutput | GenerateReplyError;
