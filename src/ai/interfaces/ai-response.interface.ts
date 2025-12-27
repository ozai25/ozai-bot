import type { AiProviderName } from './ai-provider.interface';

export interface AiResponse {
  ok: true;
  providerUsed: AiProviderName;
  model: string;
  text: string;
  latencyMs: number;
  circuitState: 'closed' | 'open' | 'half-open';
  failover: boolean;
}

export interface AiFailure {
  ok: false;
  errorCode: 'AI_ALL_PROVIDERS_FAILED' | 'AI_TIMEOUT' | 'AI_BAD_REQUEST';
  message: string;
  circuitState: 'closed' | 'open' | 'half-open';
}

export type AiResult = AiResponse | AiFailure;
