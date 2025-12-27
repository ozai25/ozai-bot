import type {
  AiProvider,
  AiProviderName,
  AiGenerateInput,
  AiProviderResult,
} from '../interfaces/ai-provider.interface';

export abstract class BaseAiProvider implements AiProvider {
  abstract readonly name: AiProviderName;
  abstract readonly model: string;

  abstract generate(input: AiGenerateInput): Promise<AiProviderResult>;

  protected nowMs(): number {
    return Date.now();
  }
}
