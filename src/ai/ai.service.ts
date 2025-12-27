// src/ai/ai.service.ts
import { Injectable } from '@nestjs/common';
import { LoggerService } from '../observability/logger.service';

import { OpenAiProvider } from './providers/openai.provider';
import { ClaudeProvider } from './providers/claude.provider';
import { CircuitBreakerStrategy } from './strategies/circuit-breaker.strategy';

import type { AiResult } from './interfaces/ai-response.interface';
import { Sg01CleaningPrompt } from './prompts/sg01-cleaning.prompt';
import { Fp02FurniturePrompt } from './prompts/fp02-furniture.prompt';

// ✅ ADD: OZ01 HQ prompt
import { Oz01DefaultPrompt } from './prompts/oz01-default.prompt';

@Injectable()
export class AiService {
  constructor(
    private readonly logger: LoggerService,
    private readonly openai: OpenAiProvider,
    private readonly claude: ClaudeProvider,
    private readonly breaker: CircuitBreakerStrategy,
  ) {}

  async generateResponse(params: {
    tenantSlug: string;
    userText: string;
  }): Promise<AiResult> {
    const { tenantSlug, userText } = params;

    const prompt = this.getPromptForTenant(tenantSlug);
    const systemPrompt = prompt.buildSystemPrompt();

    // keep this (it’s useful for debugging/visibility)
    const circuitState = await this.breaker.getState(tenantSlug);
    const shouldTryOpenAi = await this.breaker.shouldUseOpenAi(tenantSlug);

    if (shouldTryOpenAi) {
      try {
        const r = await this.openai.generate({
          tenantSlug,
          userText,
          systemPrompt,
        });
        await this.breaker.recordSuccess(tenantSlug);

        this.logger.log(
          JSON.stringify({
            event: 'ai_response',
            tenantSlug,
            provider: r.provider,
            model: r.model,
            latencyMs: r.latencyMs,
            circuitState: await this.breaker.getState(tenantSlug),
            failover: false,
            previousCircuitState: circuitState,
          }),
          'AiService',
        );

        return {
          ok: true,
          providerUsed: r.provider,
          model: r.model,
          text: r.text,
          latencyMs: r.latencyMs,
          circuitState: await this.breaker.getState(tenantSlug),
          failover: false,
        };
      } catch (e: any) {
        await this.breaker.recordFailure(tenantSlug);

        this.logger.warn(
          JSON.stringify({
            event: 'ai_openai_failed',
            tenantSlug,
            circuitState: await this.breaker.getState(tenantSlug),
            previousCircuitState: circuitState,
            error: String(e?.message ?? e),
          }),
          'AiService',
        );
      }
    }

    try {
      const r = await this.claude.generate({ tenantSlug, userText, systemPrompt });

      this.logger.log(
        JSON.stringify({
          event: 'ai_response',
          tenantSlug,
          provider: r.provider,
          model: r.model,
          latencyMs: r.latencyMs,
          circuitState: await this.breaker.getState(tenantSlug),
          failover: true,
          previousCircuitState: circuitState,
        }),
        'AiService',
      );

      return {
        ok: true,
        providerUsed: r.provider,
        model: r.model,
        text: r.text,
        latencyMs: r.latencyMs,
        circuitState: await this.breaker.getState(tenantSlug),
        failover: true,
      };
    } catch (e: any) {
      this.logger.error(
        JSON.stringify({
          event: 'ai_all_providers_failed',
          tenantSlug,
          circuitState: await this.breaker.getState(tenantSlug),
          previousCircuitState: circuitState,
          error: String(e?.message ?? e),
        }),
        '',
        'AiService',
      );

      return {
        ok: false,
        errorCode: 'AI_ALL_PROVIDERS_FAILED',
        message: 'Both OpenAI and Claude failed. Returning fallback message.',
        circuitState: await this.breaker.getState(tenantSlug),
      };
    }
  }

  private getPromptForTenant(tenantSlug: string) {
    const slug = String(tenantSlug || '').toLowerCase();

    if (slug === 'oz01') return new Oz01DefaultPrompt();
    if (slug === 'fp02') return new Fp02FurniturePrompt();
    return new Sg01CleaningPrompt();
  }
}
