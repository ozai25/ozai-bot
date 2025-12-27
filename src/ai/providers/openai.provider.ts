import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

import { BaseAiProvider } from './base.provider';
import type { AiGenerateInput, AiProviderResult } from '../interfaces/ai-provider.interface';

@Injectable()
export class OpenAiProvider extends BaseAiProvider {
  readonly name = 'openai' as const;
  readonly model: string;

  private readonly client: OpenAI;
  private readonly timeoutMs: number;
  private readonly maxTokens: number;

  constructor(private readonly config: ConfigService) {
    super();

    const apiKey = this.config.get<string>('ai.openai.apiKey');
    this.model = this.config.get<string>('ai.openai.model') ?? 'gpt-4o-mini';
    this.timeoutMs = Number(this.config.get<number>('ai.openai.timeoutMs') ?? 30000);
    this.maxTokens = Number(this.config.get<number>('ai.openai.maxTokens') ?? 800);

    // ✅ Keep safe placeholder, but do not silently succeed without a key.
    this.client = new OpenAI({ apiKey: apiKey ?? 'MISSING_OPENAI_API_KEY' });
  }

  async generate(input: AiGenerateInput): Promise<AiProviderResult> {
    const start = this.nowMs();

    const req = this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: input.systemPrompt },
        { role: 'user', content: input.userText },
      ],
      max_tokens: this.maxTokens,
      temperature: 0.4,
    });

    const completion = await this.withTimeout(req, this.timeoutMs);

    const text = completion.choices?.[0]?.message?.content?.trim() ?? '';
    const latencyMs = this.nowMs() - start;

    return {
      provider: 'openai',
      model: this.model,
      text,
      latencyMs,
      usage: {
        inputTokens: completion.usage?.prompt_tokens,
        outputTokens: completion.usage?.completion_tokens,
      },
    };
  }

  private async withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('OPENAI_TIMEOUT')), ms),
      ),
    ]);
  }
}
