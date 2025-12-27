export type AiProviderName = 'openai' | 'claude';

export interface AiGenerateInput {
  tenantSlug: string;
  userText: string;
  systemPrompt: string;
  metadata?: Record<string, any>;
}

export interface AiProviderResult {
  provider: AiProviderName;
  text: string;
  model: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
  latencyMs: number;
}

export interface AiProvider {
  readonly name: AiProviderName;
  generate(input: AiGenerateInput): Promise<AiProviderResult>;
}
