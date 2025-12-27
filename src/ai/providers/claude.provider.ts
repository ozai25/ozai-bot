import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

import { BaseAiProvider } from './base.provider';
import type { AiGenerateInput, AiProviderResult } from '../interfaces/ai-provider.interface';

@Injectable()
export class ClaudeProvider extends BaseAiProvider {
  readonly name = 'claude' as const;
  readonly model: string;

  private readonly client: Anthropic;
  private readonly timeoutMs: number;
  private readonly maxTokens: number;

  constructor(private readonly config: ConfigService) {
    super();

    const apiKey = this.config.get<string>('ai.claude.apiKey');
    this.model =
      this.config.get<string>('ai.claude.model') ?? 'claude-3-5-sonnet-20241022';
    this.timeoutMs = Number(this.config.get<number>('ai.claude.timeoutMs') ?? 30000);
    this.maxTokens = Number(this.config.get<number>('ai.claude.maxTokens') ?? 800);

    this.client = new Anthropic({ apiKey: apiKey ?? 'MISSING_ANTHROPIC_API_KEY' });
  }

  async generate(input: AiGenerateInput): Promise<AiProviderResult> {
    const start = this.nowMs();

    const req = this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      temperature: 0.4,
      system: input.systemPrompt,
      messages: [{ role: 'user', content: input.userText }],
    });

    const msg = await this.withTimeout(req, this.timeoutMs);

    const text =
      (msg.content?.[0] && 'text' in msg.content[0] ? msg.content[0].text : '')?.trim() ??
      '';

    const latencyMs = this.nowMs() - start;

    return {
      provider: 'claude',
      model: this.model,
      text,
      latencyMs,
      usage: {
        // ✅ Anthropic returns usage on the response; include it when present
        inputTokens: (msg as any).usage?.input_tokens,
        outputTokens: (msg as any).usage?.output_tokens,
      },
    };
  }

  private async withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('CLAUDE_TIMEOUT')), ms),
      ),
    ]);
  }
}
